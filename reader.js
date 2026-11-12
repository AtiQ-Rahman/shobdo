// Reader for saved webpages (reader.html?id=<id>): the cleaned article, with highlights, notes, your words,
// recall mode and a reading timer. Highlights are stored as character positions in the article text, plus the
// highlighted text and a little of what comes before it, so they still find their place after "Save again".
import { store, esc, dayKey, renameDoc, watchTextSize } from "./shared.js";
import { COLORS } from "./annotations.js";
import { initSidePanel } from "./sidepanel.js";
import { annKey } from "./pages.js";
watchTextSize();

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id") || "";
const key = "page:" + id, AKEY = annKey(id);
const content = $("content"), container = $("viewerContainer");
initSidePanel();

let record = null;               // "page:<id>"
let data = { items: [], note: "" }; // highlights + page note
let text = "";                   // the article's text; highlight positions point into it
const lost = new Set();          // highlights whose text isn't in the article any more

function status(msg) { $("status").textContent = msg || ""; }

// ---------- title, rename, meta line ----------
function showName() {
  const n = record.name || record.title || "Saved page";
  $("title").textContent = n;
  $("docTitle").textContent = n;
  document.title = n + " — Shobdo";
  if (window.BPD_CTX) window.BPD_CTX.title = n;
}
function showMeta() {
  const words = Math.round((record.chars || text.length) / 6);
  const parts = [record.site, record.byline, (record.sel ? "Selection saved " : "Saved ") + new Date(record.saved || record.first || Date.now()).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    words > 50 ? `about ${Math.max(1, Math.round(words / 200))} min read` : ""].filter(Boolean);
  $("docMeta").innerHTML = parts.map(esc).join(" · ") +
    (/^https?:/.test(record.url) ? ` · <a href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">Original page</a>` : "");
  if (/^https?:/.test(record.url)) { $("origBtn").href = record.url; $("origBtn").hidden = false; }
}
function startRename() {
  if (!record) return;
  const inp = $("titleInput");
  inp.value = $("title").textContent;
  $("title").hidden = true; inp.hidden = false; inp.focus(); inp.select();
}
async function endRename(save) {
  const inp = $("titleInput");
  if (inp.hidden) return;
  inp.hidden = true; $("title").hidden = false;
  if (save) await renameDoc(key, inp.value); // the storage listener updates the title
}
$("title").onclick = startRename;
$("title").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startRename(); } };
$("titleInput").onkeydown = (e) => { if (e.key === "Enter") endRename(true); if (e.key === "Escape") endRename(false); };
$("titleInput").onblur = () => endRename(true);
chrome.storage.onChanged.addListener((c) => {
  if (!record || !c[key]) return;
  const n = c[key].newValue?.name;
  if (!c[key].newValue) { status("This page was removed in the Library."); return; }
  if (n === record.name) return;
  if (n) record.name = n; else delete record.name;
  showName();
});

// ---------- positions in the text ----------
// Character offset of (node, offset) inside the article. Range.toString() counts text the same way textContent does.
function offsetOf(node, off) {
  const r = document.createRange();
  r.setStart(content, 0); r.setEnd(node, off);
  return r.toString().length;
}
// Where a highlight is now: its stored place if the text there still matches, otherwise the copy of its
// text whose preceding words match (or that is closest to where it was).
function anchor(it) {
  if (!it.text) return null;
  if (text.slice(it.start, it.end) === it.text) return it.start;
  let best = null;
  for (let i = text.indexOf(it.text); i >= 0; i = text.indexOf(it.text, i + 1)) {
    const score = (it.prefix && text.slice(Math.max(0, i - it.prefix.length), i) === it.prefix ? 0 : 1e9) + Math.abs(i - it.start);
    if (!best || score < best.score) best = { i, score };
  }
  return best ? best.i : null;
}

// ---------- highlights on the page ----------
function placeHighlights() {
  let moved = false;
  lost.clear();
  for (const it of data.items) {
    const s = anchor(it);
    if (s == null) { lost.add(it.id); continue; }
    if (s !== it.start) { it.end = s + it.text.length; it.start = s; moved = true; }
    wrap(it);
  }
  if (moved) save(true);
}

// Wrap the text of one highlight in <mark> elements (one per text node it covers).
function wrap(it) {
  const parts = [];
  const w = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let pos = 0;
  while (w.nextNode()) {
    const n = w.currentNode, len = n.data.length;
    const s = Math.max(it.start, pos) - pos, e = Math.min(it.end, pos + len) - pos;
    if (e > s && !/^(table|thead|tbody|tfoot|tr|ul|ol|dl)$/.test(n.parentElement.localName)) parts.push([n, s, e]);
    pos += len;
    if (pos >= it.end) break;
  }
  let last = null;
  for (const [n0, s, e] of parts) {
    let n = n0;
    if (e < n.data.length) n.splitText(e);
    if (s > 0) n = n.splitText(s);
    const m = document.createElement("mark");
    m.className = "bpd-mark";
    m.dataset.id = it.id;
    m.style.setProperty("--c", it.color);
    n.replaceWith(m);
    m.append(n);
    last = m;
  }
  if (last) styleNote(it);
}
const marksOf = (it) => content.querySelectorAll(`mark.bpd-mark[data-id="${it.id}"]`);
function styleNote(it) {
  const ms = marksOf(it);
  ms.forEach((m, i) => {
    m.style.setProperty("--c", it.color);
    m.classList.toggle("note-end", !!it.note && i === ms.length - 1);
    m.title = it.note ? it.note.slice(0, 120) : "";
  });
}
function unwrap(it) {
  for (const m of marksOf(it)) { const p = m.parentNode; m.replaceWith(...m.childNodes); p.normalize(); }
}

// ---------- create (from the selection bar or the meaning box) ----------
function create({ start, end }, color, withNote) {
  const it = { id: Math.random().toString(36).slice(2, 10), start, end, text: text.slice(start, end), prefix: text.slice(Math.max(0, start - 32), start), color, note: "", t: Date.now() };
  data.items.push(it);
  getSelection().removeAllRanges();
  wrap(it);
  save(true); renderSide();
  if (withNote) openEditor(it, true);
}
window.BPD_SELECTION_EXTRAS = (range) => {
  if (!record || !content.contains(range.commonAncestorContainer)) return [];
  // Positions are taken now: looking a word up re-marks the text, which would detach this selection.
  let start = offsetOf(range.startContainer, range.startOffset), end = offsetOf(range.endContainer, range.endOffset);
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end <= start) return [];
  const snap = { start, end };
  return [
    ...COLORS.map((x) => ({ cls: "dot", title: "Highlight " + x.name.toLowerCase(), html: `<i style="background:${x.c}"></i>`, onClick: () => create(snap, x.c) })),
    { cls: "note", title: "Highlight and add a note", html: "Note", onClick: () => create(snap, COLORS[0].c, true) }
  ];
};

// ---------- storage ----------
let saveTimer = 0;
function save(now) {
  clearTimeout(saveTimer);
  const write = () => store.set({ [AKEY]: data });
  if (now) write(); else saveTimer = setTimeout(write, 400);
  $("noteCount").textContent = data.items.length ? String(data.items.length) : "";
}

// ---------- click a highlight → edit ----------
let editor = null, clickTimer = 0;
content.addEventListener("click", (e) => {
  const m = e.target.closest("mark.bpd-mark");
  if (!m || e.detail !== 1 || !getSelection().isCollapsed || e.target.closest("a")) return;
  const it = data.items.find((x) => x.id === m.dataset.id);
  if (it) clickTimer = setTimeout(() => openEditor(it), 260); // wait: a double-click means "look up the word"
});
content.addEventListener("dblclick", () => clearTimeout(clickTimer));
function closeEditor() { editor?.remove(); editor = null; }
function openEditor(it, focus) {
  const ms = marksOf(it);
  if (!ms.length) return;
  closeEditor();
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
  const first = ms[0].getBoundingClientRect(), last = ms[ms.length - 1].getBoundingClientRect();
  const ew = editor.offsetWidth, eh = editor.offsetHeight;
  let top = last.bottom + 8;
  if (top + eh > innerHeight - 8) top = Math.max(52, first.top - eh - 8);
  editor.style.left = Math.min(Math.max(8, first.left), innerWidth - ew - 8) + "px";
  editor.style.top = top + "px";
  const ta = editor.querySelector("textarea");
  if (focus) ta.focus();
  ta.addEventListener("input", () => { it.note = ta.value; styleNote(it); save(); renderSide(); });
  editor.addEventListener("click", (e) => {
    const sw = e.target.closest(".sw");
    if (sw) { it.color = sw.dataset.c; editor.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === sw)); styleNote(it); save(); renderSide(); }
    if (e.target.closest(".del")) remove(it);
    if (e.target.closest(".done")) { save(true); closeEditor(); }
  });
}
function remove(it) {
  unwrap(it);
  data.items = data.items.filter((x) => x !== it);
  lost.delete(it.id);
  save(true); renderSide(); closeEditor();
}
document.addEventListener("mousedown", (e) => { if (editor && !editor.contains(e.target)) { save(true); closeEditor(); } }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && editor) { save(true); closeEditor(); } });
container.addEventListener("scroll", () => { if (editor && !editor.contains(document.activeElement)) closeEditor(); });

// ---------- Notes tab ----------
const sorted = () => [...data.items].sort((a, b) => a.start - b.start);
function renderSide() {
  const list = document.querySelector("#paneNotes .list"), note = $("docnote");
  if (document.activeElement !== note) note.value = data.note || "";
  $("noteCount").textContent = data.items.length ? String(data.items.length) : "";
  const items = sorted();
  list.innerHTML = items.length ? items.map((x) => `
    <li><button class="item" data-id="${x.id}" style="--c:${x.color}">
      ${lost.has(x.id) ? `<span class="lost">Not found in the page text any more. Click to remove it.</span>` : ""}
      <span class="q">${esc(x.text)}</span>
      ${x.note ? `<span class="n">${esc(x.note)}</span>` : ""}
    </button></li>`).join("")
    : `<li class="empty">Select text on the page and pick a color to highlight it. Click a highlight to add a note.</li>`;
}
$("docnote").addEventListener("input", (e) => { data.note = e.target.value; save(); });
document.querySelector("#paneNotes .list").addEventListener("click", (e) => {
  const b = e.target.closest(".item");
  const it = b && data.items.find((x) => x.id === b.dataset.id);
  if (!it) return;
  if (lost.has(it.id)) { if (confirm("Remove this highlight? Its text isn't on the saved page any more.")) remove(it); return; }
  const ms = marksOf(it);
  if (!ms.length) return;
  container.scrollTop += ms[0].getBoundingClientRect().top - container.getBoundingClientRect().top - 120;
  ms.forEach((m) => { m.classList.remove("flash"); void m.offsetWidth; m.classList.add("flash"); });
});
document.querySelector("#paneNotes .export").addEventListener("click", () => {
  const title = $("title").textContent;
  let md = `# ${title}\n\n${/^https?:/.test(record?.url) ? `Source: ${record.url}\n\n` : ""}`;
  if (data.note) md += `${data.note}\n\n`;
  for (const x of sorted()) md += `- “${x.text.replace(/\s+/g, " ")}”${x.note ? `\n  - ${x.note.replace(/\n/g, "\n    ")}` : ""}\n`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  a.download = (title || "notes").replace(/[\\/:*?"<>|]+/g, " ").trim() + " - notes.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- your words: underlines + the Words tab ----------
let wordMap = new Map(), markOn = true;
const sessionWords = []; // looked up since this tab was opened
async function loadWords() {
  markOn = (await store.get("markSeen")).markSeen !== false;
  wordMap = await window.BPDWords.load();
  for (const w of sessionWords) window.BPDWords.add(wordMap, w);
}
addEventListener("bpd:lookup", (e) => {
  sessionWords.push(e.detail);
  window.BPDWords.add(wordMap, e.detail);
  markWords(); renderWordList();
});
function markWords() {
  content.querySelectorAll(".bpd-seen, .bpd-saved").forEach((s) => { const p = s.parentNode; s.replaceWith(s.textContent); p.normalize(); });
  if (!markOn || !wordMap.size) return;
  const w = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  const re = new RegExp(window.BPDWords.WORD.source, "g");
  for (const node of nodes) {
    const t = node.data;
    let m, last = 0, frag = null;
    re.lastIndex = 0;
    while ((m = re.exec(t))) {
      const e = window.BPDWords.match(wordMap, m[0]);
      if (!e) continue;
      frag ||= document.createDocumentFragment();
      frag.append(t.slice(last, m.index));
      const s = document.createElement("span");
      s.className = e.saved ? "bpd-saved" : "bpd-seen";
      s.title = e.meaning || "";
      s.textContent = m[0];
      frag.append(s);
      last = m.index + m[0].length;
    }
    if (frag) { frag.append(t.slice(last)); node.replaceWith(frag); }
  }
}

let recall = true, found = [];
const revealed = new Set();
function setRecall(on) {
  recall = on; revealed.clear();
  $("recallToggle").checked = on; $("showAll").hidden = !on;
  renderWordList();
}
$("recallToggle").onchange = (e) => { setRecall(e.target.checked); store.set({ recall }); };
$("showAll").onclick = () => { for (const w of found) revealed.add(w.key); renderWordList(); };
store.get("recall").then((r) => setRecall(r.recall !== false));

function renderWordList() {
  if (!record) return;
  found = window.BPDWords.sorted(window.BPDWords.scan(wordMap, text));
  const savedN = found.filter((w) => w.saved).length;
  $("wordCount").textContent = found.length ? String(found.length) : "";
  $("reviseBtn").hidden = !savedN;
  $("reviseBtn").textContent = `Revise ${savedN === 1 ? "this word" : `these ${savedN} words`}`;
  $("wordList").innerHTML = found.length ? found.map((w, i) => {
    const meaning = (w.meaning ? `<span class="m">${esc(w.meaning)}</span>` : "") + (w.def ? `<span class="d">${esc(w.def)}</span>` : "");
    const hide = recall && meaning && !revealed.has(w.key);
    return `<li><button data-i="${i}">
      <span class="w${w.saved ? " saved" : " now"}">${esc(w.word)}</span><span class="c">${w.count}×</span>
      ${hide ? "" : meaning}
    </button>${hide ? `<button class="reveal" data-k="${esc(w.key)}" title="Click to show the meaning" aria-label="Show the meaning of ${esc(w.word)}"><span class="blur" aria-hidden="true">${meaning}</span></button>` : ""}</li>`;
  }).join("") : `<li class="empty">None of your saved words are on this page. Words you look up while reading will appear here too.</li>`;
}
$("reviseBtn").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") + "?rv=" + encodeURIComponent(key) + "#revise" });

// Click a word: select its next occurrence on the page.
const nextHit = new Map();
$("wordList").addEventListener("click", (e) => {
  const r = e.target.closest("button[data-k]");
  if (r) { revealed.add(r.dataset.k); renderWordList(); return; }
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  const w = found[+b.dataset.i], hits = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const re = new RegExp(window.BPDWords.WORD.source, "g");
  while (walker.nextNode()) {
    const n = walker.currentNode;
    let m; re.lastIndex = 0;
    while ((m = re.exec(n.data))) if (window.BPDWords.match(wordMap, m[0])?.key === w.key) hits.push([n, m.index, m[0].length]);
  }
  if (!hits.length) return;
  const k = (nextHit.get(w.key) || 0) % hits.length;
  nextHit.set(w.key, k + 1);
  const [n, i, len] = hits[k];
  const range = document.createRange(); range.setStart(n, i); range.setEnd(n, i + len);
  const box = range.getBoundingClientRect(), cb = container.getBoundingClientRect();
  container.scrollTop += box.top - cb.top - cb.height / 3;
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
});

let markTimer = 0;
chrome.storage.onChanged.addListener((c) => {
  if (c.recall && (c.recall.newValue !== false) !== recall) setRecall(c.recall.newValue !== false);
  if (!record || !Object.keys(c).some((k) => k.startsWith("v:") || k === "markSeen")) return;
  clearTimeout(markTimer);
  markTimer = setTimeout(async () => { await loadWords(); markWords(); renderWordList(); }, 300);
});

// ---------- where you stopped ----------
let userScrolled = false;
function restoreScroll() {
  if (!record.pos) return;
  const go = () => { if (!userScrolled) container.scrollTop = record.pos * (container.scrollHeight - container.clientHeight); };
  go();
  // Images load later and push the text down: scroll again once they have (or after 4 s at most).
  const imgs = [...content.querySelectorAll("img")].filter((i) => !i.complete);
  if (!imgs.length) return;
  Promise.race([Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }))),
    new Promise((r) => setTimeout(r, 4000))]).then(go);
}
for (const ev of ["wheel", "keydown", "mousedown", "touchstart"]) container.addEventListener(ev, () => { userScrolled = true; }, { passive: true, once: true });
let posTimer = 0;
container.addEventListener("scroll", () => {
  if (!record) return;
  const max = container.scrollHeight - container.clientHeight;
  record.pos = max > 0 ? +(container.scrollTop / max).toFixed(4) : 0;
  clearTimeout(posTimer);
  posTimer = setTimeout(flush, 1500);
}, { passive: true });

// ---------- reading timer ----------
// Counts only while the tab is visible and you've scrolled/clicked/typed in the last 2 minutes.
const IDLE_MS = 2 * 60 * 1000;
let lastActive = Date.now(), pending = 0, lastTick = performance.now();
const fmt = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
for (const ev of ["mousemove", "mousedown", "keydown", "wheel", "touchstart"]) addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
container.addEventListener("scroll", () => { lastActive = Date.now(); }, { passive: true });
const active = () => !!record && document.visibilityState === "visible" && Date.now() - lastActive < IDLE_MS;
function updateTimer() {
  if (!record) return;
  $("timerText").textContent = fmt((record.ms || 0) + pending);
  $("timer").classList.toggle("paused", !active());
}
async function flush() {
  if (!record) return;
  const add = pending; pending = 0;
  const day = dayKey();
  const got = await store.get([day, key]);
  if (!got[key]) return; // removed in the Library meanwhile
  const d = got[day] || { ms: 0, n: 0 };
  d.ms += add;
  record = { ...got[key], ms: (got[key].ms || 0) + add, pos: record.pos, t: Date.now() };
  await store.set(add ? { [day]: d, [key]: record } : { [key]: record });
}
setInterval(() => {
  const now = performance.now(), dt = Math.min(now - lastTick, 2000);
  lastTick = now;
  if (active()) pending += dt;
  updateTimer();
  if (pending >= 15000) flush();
}, 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); updateTimer(); });
addEventListener("pagehide", () => flush());

// ---------- open ----------
// Runs last, once everything below is defined.
async function open() {
  const got = await store.get([key, "ptext:" + id, AKEY]);
  const saved = got["ptext:" + id];
  if (!got[key] || !saved) {
    $("doc").hidden = true;
    status("This saved page isn't here any more. It may have been removed in the Library.");
    return;
  }
  record = got[key];
  data = got[AKEY] || data;
  window.BPD_CTX = { title: record.name || record.title, url: record.url, docKey: key }; // words saved here remember this page
  showName();
  showMeta();
  content.innerHTML = window.BPDSanitize(saved.html, record.url); // cleaned when saved, and again here
  for (const img of content.querySelectorAll("img")) img.loading = "eager"; // so the page has its full height before we scroll back
  text = content.textContent;
  placeHighlights();
  renderSide();
  await loadWords();
  markWords();
  renderWordList();
  restoreScroll();
  $("timer").hidden = false;
  record.t = Date.now();
  store.set({ [key]: { ...record } });
}
await open();
