// Highlights + notes for the PDF reader. Stored per PDF (by fingerprint) in chrome.storage.local as "ann:<id>".
// Positions are fractions of the page box, so they survive zooming.

export const COLORS = [
  { name: "Yellow", c: "#ffd000" },
  { name: "Green", c: "#5ee07a" },
  { name: "Blue", c: "#66b8ff" },
  { name: "Pink", c: "#ff7eb6" }
];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function initAnnotations({ viewer, eventBus, container, side, countEl }) {
  let key = null, title = "";
  let data = { items: [], note: "" };
  let editor = null;

  // ---------- storage ----------
  let saveTimer = 0;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => key && chrome.storage.local.set({ [key]: data });
    if (now) write(); else saveTimer = setTimeout(write, 400);
    countEl.textContent = data.items.length ? String(data.items.length) : "";
  }

  async function setDocument(id, docTitle) {
    key = "ann:" + id; title = docTitle;
    data = (await chrome.storage.local.get(key))[key] || { items: [], note: "" };
    countEl.textContent = data.items.length ? String(data.items.length) : "";
    renderAll(); renderSide();
  }

  // ---------- geometry ----------
  function pageBox(div) {
    const r = div.getBoundingClientRect();
    return { left: r.left + div.clientLeft, top: r.top + div.clientTop, width: div.clientWidth, height: div.clientHeight };
  }

  function pageViews() {
    const out = [];
    for (let i = 0; i < viewer.pagesCount; i++) { const v = viewer.getPageView(i); if (v?.div) out.push(v); }
    return out;
  }

  function rangeToRects(range) {
    const byPage = new Map();
    const pages = pageViews().map((v) => ({ v, b: pageBox(v.div) }));
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const p = pages.find(({ b }) => cx >= b.left && cx <= b.left + b.width && cy >= b.top && cy <= b.top + b.height);
      if (!p) continue;
      const n = p.v.id;
      if (!byPage.has(n)) byPage.set(n, []);
      byPage.get(n).push([(r.left - p.b.left) / p.b.width, (r.top - p.b.top) / p.b.height, r.width / p.b.width, r.height / p.b.height]);
    }
    for (const [n, rs] of byPage) byPage.set(n, merge(rs));
    return byPage;
  }

  // pdf.js gives one rect per text span; join the ones on the same line.
  function merge(rs) {
    rs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const out = [];
    for (const r of rs) {
      const l = out[out.length - 1];
      if (l && Math.abs(l[1] - r[1]) < Math.min(l[3], r[3]) * 0.5 && r[0] <= l[0] + l[2] + 0.01) {
        const x2 = Math.max(l[0] + l[2], r[0] + r[2]), y2 = Math.max(l[1] + l[3], r[1] + r[3]);
        l[0] = Math.min(l[0], r[0]); l[1] = Math.min(l[1], r[1]); l[2] = x2 - l[0]; l[3] = y2 - l[1];
      } else out.push([...r]);
    }
    return out.map((r) => r.map((x) => +x.toFixed(5)));
  }

  // ---------- create ----------
  function create(range, color, withNote) {
    const text = range.toString().replace(/\s+/g, " ").trim();
    const byPage = rangeToRects(range);
    if (!byPage.size) return;
    let first = null;
    for (const [page, rects] of byPage) {
      const item = { id: Math.random().toString(36).slice(2, 10), page, rects, text, color, note: "", t: Date.now() };
      data.items.push(item);
      first ||= item;
    }
    window.getSelection().removeAllRanges();
    save(true); renderAll(); renderSide();
    if (withNote) openEditor(first, true);
  }

  // Buttons offered in the selection bar (see content.js / popup.js).
  window.BPD_SELECTION_EXTRAS = (range) => {
    const n = range.commonAncestorContainer;
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (!key || !el?.closest(".pdfViewer")) return [];
    const r = range.cloneRange();
    return [
      ...COLORS.map((x) => ({ cls: "dot", title: "Highlight " + x.name.toLowerCase(), html: `<i style="background:${x.c}"></i>`, onClick: () => create(r, x.c) })),
      { cls: "note", title: "Highlight and add a note", html: "Note", onClick: () => create(r, COLORS[0].c, true) }
    ];
  };

  // ---------- render on pages ----------
  function renderPage(n) {
    const v = viewer.getPageView(n - 1);
    if (!v?.div) return;
    let layer = v.div.querySelector(":scope > .bpd-hl-layer");
    if (!layer) { layer = document.createElement("div"); layer.className = "bpd-hl-layer"; v.div.appendChild(layer); }
    const items = data.items.filter((x) => x.page === n);
    layer.innerHTML = items.map((x) => x.rects.map(([l, t, w, h], i) =>
      `<div class="bpd-hl" data-id="${x.id}" style="left:${l * 100}%;top:${t * 100}%;width:${w * 100}%;height:${h * 100}%;background:${x.color}"></div>` +
      (i === 0 && x.note ? `<button class="bpd-pin" data-id="${x.id}" title="${esc(x.note.slice(0, 120))}" style="left:calc(${(l + w) * 100}% - 6px);top:calc(${t * 100}% - 10px);background:${x.color}"></button>` : "")
    ).join("")).join("");
  }
  function renderAll() { for (const v of pageViews()) renderPage(v.id); }
  eventBus.on("pagerendered", (e) => renderPage(e.pageNumber));
  eventBus.on("textlayerrendered", (e) => renderPage(e.pageNumber));

  // ---------- click a highlight → edit ----------
  function itemAt(x, y) {
    for (const v of pageViews()) {
      const b = pageBox(v.div);
      if (x < b.left || x > b.left + b.width || y < b.top || y > b.top + b.height) continue;
      const fx = (x - b.left) / b.width, fy = (y - b.top) / b.height;
      return data.items.find((it) => it.page === v.id && it.rects.some(([l, t, w, h]) => fx >= l && fx <= l + w && fy >= t && fy <= t + h));
    }
    return null;
  }

  let clickTimer = 0;
  container.addEventListener("click", (e) => {
    const pin = e.target.closest(".bpd-pin");
    if (pin) { openEditor(data.items.find((x) => x.id === pin.dataset.id)); return; }
    if (e.detail !== 1 || !window.getSelection().isCollapsed) return;
    const it = itemAt(e.clientX, e.clientY);
    if (it) clickTimer = setTimeout(() => openEditor(it), 260); // wait: a double-click means "look up the word"
  });
  container.addEventListener("dblclick", () => clearTimeout(clickTimer));

  function closeEditor() { editor?.remove(); editor = null; }

  function openEditor(it, focus) {
    if (!it) return;
    closeEditor();
    const v = viewer.getPageView(it.page - 1);
    editor = document.createElement("div");
    editor.className = "bpd-editor";
    editor.innerHTML = `
      <div class="row">
        <span class="colors">${COLORS.map((x) => `<button class="sw${x.c === it.color ? " on" : ""}" data-c="${x.c}" title="${x.name}" style="background:${x.c}"></button>`).join("")}</span>
        <button class="del">Delete highlight</button>
      </div>
      <blockquote>${esc(it.text)}</blockquote>
      <textarea rows="3" placeholder="Add a note…">${esc(it.note)}</textarea>
      <div class="row end"><button class="done">Done</button></div>`;
    document.body.appendChild(editor);
    const b = pageBox(v.div);
    const [l, t, , h] = it.rects[it.rects.length - 1];
    const ew = editor.offsetWidth, eh = editor.offsetHeight;
    let top = b.top + (t + h) * b.height + 8;
    if (top + eh > innerHeight - 8) top = Math.max(52, b.top + it.rects[0][1] * b.height - eh - 8);
    editor.style.left = Math.min(Math.max(8, b.left + l * b.width), innerWidth - ew - 8) + "px";
    editor.style.top = top + "px";
    const ta = editor.querySelector("textarea");
    if (focus) ta.focus();
    ta.addEventListener("input", () => { it.note = ta.value; save(); renderSide(); });
    editor.addEventListener("click", (e) => {
      const sw = e.target.closest(".sw");
      if (sw) { it.color = sw.dataset.c; editor.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === sw)); save(); renderPage(it.page); renderSide(); }
      if (e.target.closest(".del")) { data.items = data.items.filter((x) => x !== it); save(true); renderPage(it.page); renderSide(); closeEditor(); }
      if (e.target.closest(".done")) { save(true); renderPage(it.page); closeEditor(); }
    });
  }
  document.addEventListener("mousedown", (e) => { if (editor && !editor.contains(e.target) && !e.target.closest(".bpd-pin")) { save(true); if (editor) renderAll(); closeEditor(); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && editor) { save(true); renderAll(); closeEditor(); } });
  container.addEventListener("scroll", () => { if (editor && !editor.contains(document.activeElement)) closeEditor(); });

  // ---------- side panel ----------
  function sorted() {
    return [...data.items].sort((a, b) => a.page - b.page || a.rects[0][1] - b.rects[0][1]);
  }

  function renderSide() {
    const list = side.querySelector(".list");
    const docNote = side.querySelector(".docnote");
    if (document.activeElement !== docNote) docNote.value = data.note || "";
    const items = sorted();
    list.innerHTML = items.length ? items.map((x) => `
      <li><button class="item" data-id="${x.id}" style="--c:${x.color}">
        <span class="pg">Page ${x.page}</span>
        <span class="q">${esc(x.text)}</span>
        ${x.note ? `<span class="n">${esc(x.note)}</span>` : ""}
      </button></li>`).join("")
      : `<li class="empty">Select text in the PDF and pick a color to highlight it. Click a highlight to add a note.</li>`;
  }

  side.querySelector(".docnote").addEventListener("input", (e) => { data.note = e.target.value; save(); });
  side.querySelector(".list").addEventListener("click", (e) => {
    const b = e.target.closest(".item");
    if (!b) return;
    const it = data.items.find((x) => x.id === b.dataset.id);
    const div = viewer.getPageView(it.page - 1).div;
    container.scrollTop = div.offsetTop + div.clientTop + it.rects[0][1] * div.clientHeight - 120;
    setTimeout(() => {
      renderPage(it.page);
      div.querySelectorAll(`.bpd-hl[data-id="${it.id}"]`).forEach((el) => el.classList.add("flash"));
    }, 60);
  });
  side.querySelector(".export").addEventListener("click", () => {
    let md = `# ${title}\n\n`;
    if (data.note) md += `${data.note}\n\n`;
    for (const x of sorted()) md += `- **Page ${x.page}:** “${x.text}”${x.note ? `\n  - ${x.note.replace(/\n/g, "\n    ")}` : ""}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = (title || "notes").replace(/[\\/:*?"<>|]+/g, " ").trim() + " - notes.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  return { setDocument, getData: () => data };
}
