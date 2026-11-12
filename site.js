// Websites: a small "N of your words" button in the corner. Opening it lists the words on this page
// that you saved or looked up before; clicking one scrolls to it.
(() => {
  if (window !== window.top || window.__bpdSite || location.protocol === "chrome-extension:") return;
  window.__bpdSite = true;

  const BN = `"Noto Serif Bengali", "Noto Sans Bengali", "Nirmala UI", Vrinda, serif`;
  const CSS = `
  :host { all: initial; }
  .wrap { --surface: #fff; --ink: #1c2421; --muted: #5e6b66; --rule: #e3e8e6; --green: #006a4e; --tint: #e7f2ee; --on-green: #fff;
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; font: var(--ui-fs, 16px)/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink);
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  @media (prefers-color-scheme: dark) { .wrap { --surface: #18201d; --ink: #e6ece9; --muted: #9aa8a2; --rule: #2c3833; --green: #4fc69a; --tint: #1f3029; --on-green: #0f1a16; } }
  button { font: inherit; color: inherit; }
  .chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px;
    background: var(--green); color: var(--on-green); font-weight: 600; font-size: 0.929em; box-shadow: 0 4px 16px rgba(0, 40, 28, .25); }
  .chip svg { width: 15px; height: 15px; }
  .chip:focus-visible, .row:focus-visible, .x:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .panel { width: 21.4em; max-width: calc(100vw - 32px); max-height: min(30em, 70vh); overflow: auto; background: var(--surface);
    border: 1px solid var(--rule); border-top: 3px solid var(--green); border-radius: 10px; box-shadow: 0 10px 30px rgba(10, 40, 30, .2);
    scrollbar-width: thin; }
  .head { position: sticky; top: 0; background: var(--surface); display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 6px; }
  .head b { font-size: 1em; }
  .head p { margin: 0; font-size: 0.857em; color: var(--muted); }
  .x { all: unset; cursor: pointer; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 6px; color: var(--muted); }
  .x:hover { background: var(--tint); }
  ul { list-style: none; margin: 0; padding: 0 6px 8px; }
  .row { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 1fr auto; width: 100%; padding: 6px 8px; border-radius: 6px; }
  .row:hover { background: var(--tint); }
  .w { font-weight: 600; }
  .tag { margin-left: 6px; font-size: 0.714em; font-weight: 700; color: var(--green); border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; vertical-align: 2px; }
  .tag.now { color: var(--muted); }
  .c { color: var(--muted); font-size: 0.857em; }
  .m { grid-column: 1 / -1; font-family: ${BN}; color: var(--green); }
  .d { grid-column: 1 / -1; font-family: Georgia, "Times New Roman", serif; font-size: 0.929em; line-height: 1.35; color: var(--ink); }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px 6px; }
  .tog, .all { all: unset; cursor: pointer; font-size: 0.857em; font-weight: 600; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--rule); color: var(--muted); }
  .tog[aria-pressed="true"] { background: var(--green); border-color: var(--green); color: var(--on-green); }
  .tog:hover, .all:hover { border-color: var(--green); }
  .tog:focus-visible, .all:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .reveal { padding-top: 0; }
  .reveal .blur { display: contents; }
  .reveal .m, .reveal .d { filter: blur(6px); user-select: none; }
  .reveal:hover .m, .reveal:hover .d { filter: blur(4px); }
  [hidden] { display: none !important; }`;
  const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M8 7h7"/></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let host, root, found = [], map = new Map(), dismissed = false;
  let uiFs = 16; // global text size from Settings
  chrome.storage.local.get("uiFs").then((r) => { uiFs = r.uiFs || 16; host?.style.setProperty("--ui-fs", uiFs + "px"); }).catch(() => {});
  chrome.storage.onChanged.addListener((c) => { if (c.uiFs) { uiFs = c.uiFs.newValue || 16; host?.style.setProperty("--ui-fs", uiFs + "px"); } });
  let recall = true; const revealed = new Set(); // recall mode: meanings hidden until clicked
  const sessionWords = []; // looked up on this page during this visit

  function pageText() {
    const t = document.body ? document.body.innerText : "";
    return t.length > 400000 ? t.slice(0, 400000) : t;
  }

  async function run() {
    if (dismissed) return;
    const s = await chrome.storage.local.get(["siteBadge", "recall"]);
    if (s.siteBadge === false) { host?.remove(); return; }
    if ((s.recall !== false) !== recall) { recall = s.recall !== false; revealed.clear(); }
    map = await window.BPDWords.load();
    for (const w of sessionWords) window.BPDWords.add(map, w);
    if (!map.size) { host?.remove(); return; }
    found = window.BPDWords.sorted(window.BPDWords.scan(map, pageText()));
    if (!found.length) { host?.remove(); return; }
    render();
  }

  function render() {
    if (!host || !host.isConnected) {
      host = document.createElement("bpd-words");
      host.style.setProperty("--ui-fs", uiFs + "px");
      root = host.attachShadow({ mode: "closed" });
      root.addEventListener("click", onClick);
      document.documentElement.appendChild(host);
    }
    const open = root.querySelector(".panel") && !root.querySelector(".panel").hidden;
    const saved = found.filter((w) => w.saved).length;
    root.innerHTML = `<style>${CSS}</style><div class="wrap">
      <div class="panel" ${open ? "" : "hidden"} role="dialog" aria-label="Your words on this page">
        <div class="head"><div><b>Your words on this page</b><p>${saved} saved${found.length - saved ? ` · ${found.length - saved} looked up now` : ""}</p></div>
          <button class="x" data-act="hide" title="Hide for this page" aria-label="Hide for this page">✕</button></div>
        <div class="bar"><button class="tog" data-act="recall" aria-pressed="${recall}" title="Hide meanings so you can test yourself. Click a hidden meaning to check it.">Recall mode</button>
          <button class="all" data-act="all" ${recall ? "" : "hidden"}>Show all</button></div>
        <ul>${found.map((w, i) => {
          const meaning = (w.meaning ? `<span class="m">${esc(w.meaning)}</span>` : "") + (w.def ? `<span class="d">${esc(w.def)}</span>` : "");
          const hide = recall && meaning && !revealed.has(w.key);
          return `<li><button class="row" data-i="${i}" title="Show on the page">
          <span><span class="w">${esc(w.word)}</span>${w.saved ? `<span class="tag">Saved</span>` : `<span class="tag now">Looked up now</span>`}</span><span class="c">${w.count}×</span>
          ${hide ? "" : meaning}</button>${hide ? `<button class="row reveal" data-k="${esc(w.key)}" title="Click to show the meaning" aria-label="Show the meaning of ${esc(w.word)}"><span class="blur" aria-hidden="true">${meaning}</span></button>` : ""}</li>`;
        }).join("")}</ul>
      </div>
      <button class="chip" data-act="toggle" aria-expanded="${open}">${ICON}${found.length} of your words</button>
    </div>`;
  }

  const next = new Map();
  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "toggle") {
      const p = root.querySelector(".panel"); p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden));
    }
    if (b.dataset.act === "hide") { dismissed = true; host.remove(); }
    if (b.dataset.act === "recall") { recall = !recall; revealed.clear(); chrome.storage.local.set({ recall }); render(); }
    if (b.dataset.act === "all") { for (const w of found) revealed.add(w.key); render(); }
    if (b.dataset.k) { revealed.add(b.dataset.k); render(); }
    if (b.dataset.i) reveal(found[+b.dataset.i]);
  }

  // Scroll to the next occurrence of the word and select it.
  function reveal(w) {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest("script, style, noscript, textarea, bpd-words, bpd-bubble") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const re = new RegExp(window.BPDWords.WORD.source, "g");
    while (walker.nextNode() && hits.length < 500) {
      const n = walker.currentNode;
      let m; re.lastIndex = 0;
      while ((m = re.exec(n.data))) if (window.BPDWords.match(map, m[0])?.key === w.key) hits.push([n, m.index, m[0].length]);
    }
    const visible = hits.filter(([n]) => n.parentElement.getClientRects().length);
    if (!visible.length) return;
    const k = (next.get(w.key) || 0) % visible.length;
    next.set(w.key, k + 1);
    const [n, i, len] = visible[k];
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + len);
    n.parentElement.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }

  setTimeout(run, 1200);
  let t = 0;
  chrome.storage.onChanged.addListener((c) => {
    if (Object.keys(c).some((k) => k.startsWith("v:") || k === "siteBadge" || k === "recall")) { clearTimeout(t); t = setTimeout(run, 500); }
  });
  addEventListener("bpd:lookup", (e) => { sessionWords.push(e.detail); clearTimeout(t); t = setTimeout(run, 300); });
})();
