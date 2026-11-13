import * as pdfjsLib from "./lib/pdf.min.mjs";
import { initAnnotations } from "./annotations.js";
import { buildAnnotatedPdf } from "./pdfexport.js";
import { watchTextSize, renameDoc } from "./shared.js";
import { initSidePanel } from "./sidepanel.js";
import { downloadWords, printHtml } from "./wordexport.js";
watchTextSize();
globalThis.pdfjsLib = pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "./lib/pdf.worker.min.mjs";
const { EventBus, PDFLinkService, PDFViewer } = await import("./lib/pdf_viewer.mjs");

const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;
const container = $("viewerContainer");
const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus });
const viewer = new PDFViewer({ container, viewer: $("viewer"), eventBus, linkService, textLayerMode: 1 });
linkService.setViewer(viewer);
const notes = initAnnotations({ viewer, eventBus, container, side: $("side"), countEl: $("noteCount") });

let doc = null;       // pdf.js document
let docKey = null;    // "doc:<fingerprint>"
let record = null;    // stored info about this PDF
let resumePage = 1;
let original = null;  // untouched bytes of the open PDF, for "Download PDF with highlights"
let pageTexts = [];   // plain text per page, for "your words in this PDF"

// ---------- toolbar ----------
eventBus.on("pagesinit", () => {
  viewer.currentScaleValue = "page-width";
  if (resumePage > 1 && resumePage <= viewer.pagesCount) viewer.currentPageNumber = resumePage;
});
eventBus.on("scalechanging", (e) => { $("zoomLabel").textContent = Math.round(e.scale * 100) + "%"; });
eventBus.on("pagechanging", (e) => { $("pageInput").value = e.pageNumber; rememberPage(e.pageNumber); });
$("zoomIn").onclick = () => viewer.increaseScale();
$("zoomOut").onclick = () => viewer.decreaseScale();
$("pageInput").onchange = (e) => { viewer.currentPageNumber = Math.max(1, Math.min(+e.target.value || 1, viewer.pagesCount)); };
function refit() { if (viewer.currentScaleValue === "page-width") viewer.currentScaleValue = "page-width"; }
initSidePanel({ onLayout: refit }); // Words / Notes panel, its width and text size
let hlAlpha = 0.4; // highlight strength, set in Settings; also used for "Download PDF with highlights"
store.get("hlAlpha").then((r) => { hlAlpha = r.hlAlpha || 0.4; });
chrome.storage.onChanged.addListener((c) => { if (c.hlAlpha) hlAlpha = c.hlAlpha.newValue || 0.4; });

// ---------- rename (click the title) ----------
function showName() {
  const n = record?.name || record?.title || "";
  $("title").textContent = n;
  document.title = n + " — Shobdo";
  if (window.BPD_CTX) window.BPD_CTX.title = n; // words saved from now on show the new name
  notes.setTitle(n);
}
function startRename() {
  if (!docKey) return;
  const inp = $("titleInput");
  inp.value = $("title").textContent;
  $("title").hidden = true; inp.hidden = false; inp.focus(); inp.select();
}
async function endRename(save) {
  const inp = $("titleInput");
  if (inp.hidden) return;
  inp.hidden = true; $("title").hidden = false;
  if (save && docKey) await renameDoc(docKey, inp.value); // the storage listener updates the title
}
$("title").onclick = startRename;
$("title").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startRename(); } };
$("titleInput").onkeydown = (e) => { if (e.key === "Enter") endRename(true); if (e.key === "Escape") endRename(false); };
$("titleInput").onblur = () => endRename(true);
chrome.storage.onChanged.addListener((c) => {
  if (!docKey || !record || !c[docKey]) return;
  const n = c[docKey].newValue?.name;
  if (n === record.name) return;
  if (n) record.name = n; else delete record.name;
  showName();
});

function status(msg) { $("status").textContent = msg || ""; }

// ---------- opening ----------
async function openData(data, name, url) {
  $("empty").hidden = true;
  status("Loading…");
  try {
    await flush();
    original = data.slice(); // pdf.js takes ownership of `data`
    const head = new TextDecoder("latin1").decode(data.subarray(0, 1024));
    if (!head.includes("%PDF")) throw new Error("this isn't a PDF file (it looks like a normal webpage)");
    doc = await pdfjsLib.getDocument({ data, verbosity: pdfjsLib.VerbosityLevel.ERRORS }).promise;
    const meta = await doc.getMetadata().catch(() => null);
    const title = (meta?.info?.Title || "").trim() || name || "Untitled PDF";
    docKey = "doc:" + doc.fingerprints[0];
    record = (await store.get(docKey))[docKey] || { ms: 0, page: 1, first: Date.now() };
    Object.assign(record, { title, url: url || record.url || "", local: !url && !record.url, pages: doc.numPages, t: Date.now() });
    await store.set({ [docKey]: record });
    resumePage = record.page || 1;
    crossed = new Set(record.crossed || []); showCrossed = false;

    window.BPD_CTX = { title: record.name || title, url: url || "", docKey };
    viewer.setDocument(doc);
    linkService.setDocument(doc);
    $("pageCount").textContent = doc.numPages;
    showName();
    $("timer").hidden = false;
    updateTimer();
    await notes.setDocument(doc.fingerprints[0], record.name || title);
    status("");
    scanDocument(doc);
  } catch (e) {
    status("Couldn't open this PDF: " + e.message);
  }
}

function readFileUrl(url) {
  // fetch() can't read file:// from extensions; XHR can (needs "Allow access to file URLs").
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("GET", url);
    x.responseType = "arraybuffer";
    x.onload = () => (x.response && x.response.byteLength ? resolve(x.response) : reject(new Error("the file is empty")));
    x.onerror = () => reject(new Error("turn on “Allow access to file URLs” for this extension in chrome://extensions"));
    x.send();
  });
}

async function openUrl(url) {
  $("empty").hidden = true;
  status("Downloading…");
  try {
    let buf;
    if (url.startsWith("file:")) buf = await readFileUrl(url);
    else {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("the server answered " + r.status);
      buf = await r.arrayBuffer();
    }
    const name = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() || "");
    await openData(new Uint8Array(buf), name, url);
  } catch (e) {
    status("Couldn't load this PDF: " + e.message);
  }
}

// ?file=<raw url> (inserted verbatim by the redirect rule, so don't parse it as a query string)
const qi = location.href.indexOf("?file=");
if (qi >= 0) {
  let url = location.href.slice(qi + 6);
  if (/^(https?|file)%3A/i.test(url)) url = decodeURIComponent(url);
  if (url) openUrl(url);
}

$("openBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = async (e) => {
  const f = e.target.files[0];
  if (f) openData(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.pdf$/i, ""));
};
document.addEventListener("dragover", (e) => { e.preventDefault(); $("empty").classList.add("drag"); });
document.addEventListener("dragleave", () => $("empty").classList.remove("drag"));
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  $("empty").classList.remove("drag");
  const f = [...e.dataTransfer.files].find((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (f) openData(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.pdf$/i, ""));
});

// ---------- last page ----------
let pageTimer = 0;
function rememberPage(n) {
  if (!record) return;
  record.page = n;
  clearTimeout(pageTimer);
  pageTimer = setTimeout(() => flush(), 1500);
}

// ---------- reading timer ----------
// Counts only while the tab is visible and you've scrolled/clicked/typed in the last 2 minutes.
const IDLE_MS = 2 * 60 * 1000;
let lastActive = Date.now();
let pending = 0;
let lastTick = performance.now();
const fmt = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
for (const ev of ["mousemove", "mousedown", "keydown", "wheel", "touchstart"]) addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
container.addEventListener("scroll", () => { lastActive = Date.now(); }, { passive: true });

function active() { return !!docKey && document.visibilityState === "visible" && Date.now() - lastActive < IDLE_MS; }
function updateTimer() {
  if (!record) return;
  $("timerText").textContent = fmt(record.ms + pending);
  $("timer").classList.toggle("paused", !active());
}

async function flush() {
  if (!docKey || !record) return;
  const add = pending; pending = 0;
  const day = "day:" + new Date().toLocaleDateString("en-CA");
  const got = await store.get([day, docKey]);
  const d = got[day] || { ms: 0, n: 0 };
  d.ms += add;
  const name = got[docKey]?.name; // it may have been renamed in the Library meanwhile
  const r = Object.assign(got[docKey] || {}, record, { ms: (got[docKey]?.ms ?? record.ms) + add, t: Date.now() });
  if (name) r.name = name; else delete r.name;
  record = r;
  await store.set({ [day]: d, [docKey]: r });
}

setInterval(() => {
  const now = performance.now();
  const dt = Math.min(now - lastTick, 2000);
  lastTick = now;
  if (active()) pending += dt;
  updateTimer();
  if (pending >= 15000) flush();
}, 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); updateTimer(); });
addEventListener("pagehide", () => flush());

// ---------- your words: marks in the text + the "Words" tab ----------
// Saved words get a solid underline, words you only looked up get a dotted one.
let wordMap = new Map();
let markOn = true;
let crossed = new Set();   // word keys crossed out of this PDF's Words list
let showCrossed = false;

const sessionWords = []; // words looked up since this reader tab was opened
async function loadWords() {
  markOn = (await store.get("markSeen")).markSeen !== false;
  wordMap = await window.BPDWords.load();
  for (const w of sessionWords) window.BPDWords.add(wordMap, w);
}
let freshKey = ""; // the word you looked up last: highlighted in the list
addEventListener("bpd:lookup", (e) => {
  sessionWords.push(e.detail);
  freshKey = String(e.detail.word || "").toLowerCase();
  window.BPDWords.add(wordMap, e.detail);
  markAll();
  if (pageTexts.length) renderWordList();
});

function unmark(layer) {
  layer.querySelectorAll(".bpd-seen, .bpd-saved").forEach((s) => s.replaceWith(document.createTextNode(s.textContent)));
  layer.normalize();
}

function mark(layer) {
  if (!layer) return;
  unmark(layer);
  if (!markOn || !wordMap.size) return;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const re = new RegExp(window.BPDWords.WORD.source, "g");
  for (const node of nodes) {
    const t = node.data;
    let m, last = 0, frag = null;
    while ((m = re.exec(t))) {
      const e = window.BPDWords.match(wordMap, m[0]);
      if (!e || crossed.has(e.key)) continue;
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

function markAll() {
  for (let i = 0; i < viewer.pagesCount; i++) mark(viewer.getPageView(i)?.textLayer?.div);
}

async function scanDocument(d) {
  pageTexts = [];
  $("wordList").innerHTML = `<li class="empty">Scanning this PDF…</li>`;
  for (let i = 1; i <= d.numPages; i++) {
    if (d !== doc) return; // another PDF was opened meanwhile
    const tc = await (await d.getPage(i)).getTextContent();
    pageTexts.push(tc.items.map((x) => x.str + (x.hasEOL ? "\n" : "")).join(" "));
  }
  renderWordList();
}

// Recall mode: meanings stay hidden until you click them, so you can test yourself first.
let recall = false;
const revealed = new Set();
function setRecall(on) {
  recall = on;
  revealed.clear();
  const b = $("recallBtn");
  b.setAttribute("aria-pressed", String(on));
  b.title = on ? "Recall mode is on: meanings are hidden (click one to check it). Click to show all meanings."
    : "Meanings are shown. Click to hide them and test yourself (Recall mode).";
  if (pageTexts.length) renderWordList();
}
$("recallBtn").onclick = () => { setRecall(!recall); store.set({ recall }); };
store.get("recall").then((r) => setRecall(r.recall !== false)); // on unless turned off

// Cross out a word: it leaves this PDF's list and isn't underlined here. Kept per PDF (record.crossed).
function setCrossed(k, on) {
  if (on) crossed.add(k); else crossed.delete(k);
  if (record) { record.crossed = [...crossed]; flush(); }
  markAll(); renderWordList();
}

// Order of the list: page order (where each word first appears), first page first or last page first.
let desc = false;
function setOrder(d) {
  desc = d;
  const b = $("wordOrder");
  b.textContent = desc ? "Page ↓" : "Page ↑";
  b.title = desc ? "Last page first. Click for first page first." : "First page first. Click for last page first.";
  if (pageTexts.length) renderWordList();
}
$("wordOrder").onclick = () => { setOrder(!desc); store.set({ wordSort: desc ? "desc" : "asc" }); };
store.get("wordSort").then((r) => setOrder(r.wordSort === "desc"));

let found = [];
function renderWordList() {
  const map = new Map();
  pageTexts.forEach((t, i) => window.BPDWords.scan(wordMap, t, i + 1, map));
  const all = [...map.values()].sort((a, b) => desc ? b.first - a.first : a.first - b.first);
  found = all.filter((w) => !crossed.has(w.key));
  const out = all.filter((w) => crossed.has(w.key));
  $("wordCount").textContent = found.length ? String(found.length) : "";
  $("wordExport").hidden = !found.length;
  const outList = out.length ? `<li class="crossed-head"><button class="crossed-toggle" aria-expanded="${showCrossed}">${showCrossed ? "▾" : "▸"} Crossed out (${out.length})</button></li>` +
    (showCrossed ? out.map((w) => `<li class="crossed"><span class="w">${escapeHtml(w.word)}</span><button class="undo" data-u="${escapeHtml(w.key)}" title="Put it back in the list">Put back</button></li>`).join("") : "") : "";
  $("wordList").innerHTML = (found.length ? found.map((w, i) => {
    const pages = [...w.pages];
    const meaning = (w.meaning ? `<span class="m">${escapeHtml(w.meaning)}</span>` : "") + (w.def ? `<span class="d">${escapeHtml(w.def)}</span>` : "");
    const hide = recall && meaning && !revealed.has(w.key);
    return `<li${w.key === freshKey ? ` class="fresh"` : ""}><button class="x" data-x="${escapeHtml(w.key)}" title="Cross out: remove from this PDF's list" aria-label="Cross out ${escapeHtml(w.word)}">×</button><button data-i="${i}">
      <span class="w${w.saved ? " saved" : " now"}">${escapeHtml(w.word)}</span><span class="c">${w.count}×</span>
      ${hide ? "" : meaning}
      <span class="p">Page${pages.length > 1 ? "s" : ""} ${pages.slice(0, 8).join(", ")}${pages.length > 8 ? "…" : ""}</span>
    </button>${hide ? `<button class="reveal" data-k="${escapeHtml(w.key)}" title="Click to show the meaning" aria-label="Show the meaning of ${escapeHtml(w.word)}"><span class="blur" aria-hidden="true">${meaning}</span></button>` : ""}</li>`;
  }).join("") : `<li class="empty">${out.length ? "You've crossed out all your words in this PDF." : "None of your saved words are in this PDF. Words you look up while reading will appear here too."}</li>`) + outList;
}
// ---------- download the word list (.txt / .md / PDF) ----------
function sentenceAt(text, at) {
  const flat = text.replace(/\s+/g, " ");
  const pos = text.slice(0, at).replace(/\s+/g, " ").length; // same spot in the flattened text
  let a = pos, b = pos;
  while (a > 0 && !/[.!?]\s/.test(flat.slice(a - 2, a))) a--;
  while (b < flat.length && !/[.!?]/.test(flat[b])) b++;
  let s = flat.slice(a, b + 1).trim();
  if (s.length > 320) { const i = pos - a; s = (i > 160 ? "…" : "") + s.slice(Math.max(0, i - 160), i + 160).trim() + "…"; }
  return s;
}
$("wordExport").addEventListener("click", (ev) => {
  const fmt = ev.target.closest("button[data-fmt]")?.dataset.fmt;
  if (!fmt) return;
  const title = record?.name || record?.title || "PDF";
  downloadWords({ fmt, title: `Words: ${title}`, fileName: `${title} - words`, order: desc ? "last page first" : "in page order",
    items: found.map((w) => {
      const page = Math.floor(w.first / 1e7), pages = [...w.pages].sort((a, b) => a - b);
      return { word: w.word, bn: w.meaning, en: w.def, sentence: pageTexts[page - 1] ? sentenceAt(pageTexts[page - 1], w.first % 1e7) : "",
        meta: `Page${pages.length > 1 ? "s" : ""} ${pages.join(", ")} (${w.count}×)` };
    }) });
});

const escapeHtml = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Click a word: jump to its next occurrence (clicking again moves on to the next page that has it).
const nextHit = new Map();
$("wordList").addEventListener("click", async (e) => {
  const x = e.target.closest("button[data-x]");
  if (x) { setCrossed(x.dataset.x, true); return; }
  const u = e.target.closest("button[data-u]");
  if (u) { setCrossed(u.dataset.u, false); return; }
  if (e.target.closest(".crossed-toggle")) { showCrossed = !showCrossed; renderWordList(); return; }
  const r = e.target.closest("button[data-k]");
  if (r) { revealed.add(r.dataset.k); renderWordList(); return; }
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  const w = found[+b.dataset.i];
  const pages = [...w.pages];
  const k = nextHit.get(w.key) || 0;
  nextHit.set(w.key, (k + 1) % pages.length);
  revealWord(w, pages[k]);
});

async function revealWord(w, page) {
  viewer.currentPageNumber = page;
  let layer = null;
  for (let tries = 0; tries < 40 && !layer; tries++) {
    const div = viewer.getPageView(page - 1)?.textLayer?.div;
    if (div && div.querySelector("span")) layer = div; else await new Promise((r) => setTimeout(r, 75));
  }
  if (!layer) return;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const re = new RegExp(window.BPDWords.WORD.source, "g");
  while (walker.nextNode()) {
    const n = walker.currentNode;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(n.data))) {
      if (window.BPDWords.match(wordMap, m[0])?.key !== w.key) continue;
      const r = document.createRange();
      r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const box = r.getBoundingClientRect(), cb = container.getBoundingClientRect();
      container.scrollTop += box.top - cb.top - cb.height / 3;
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return;
    }
  }
}

eventBus.on("textlayerrendered", (e) => mark(viewer.getPageView(e.pageNumber - 1)?.textLayer?.div));
let markTimer = 0;
chrome.storage.onChanged.addListener((c) => {
  if (c.recall && (c.recall.newValue !== false) !== recall) setRecall(c.recall.newValue !== false);
  if (!Object.keys(c).some((k) => k.startsWith("v:") || k === "markSeen")) return;
  clearTimeout(markTimer);
  markTimer = setTimeout(async () => { await loadWords(); markAll(); if (pageTexts.length) renderWordList(); }, 300);
});
await loadWords();

// ---------- download only the highlights: a short PDF of the highlighted text + notes, page by page ----------
$("downloadHl").onclick = () => {
  const data = notes.getData(), st = $("dlStatus");
  // A highlight across two pages is stored once per page with the same text: keep it once.
  const seen = new Set();
  const items = [...data.items].sort((a, b) => a.page - b.page || a.rects[0][1] - b.rects[0][1])
    .filter((x) => { const k = x.t + "|" + x.text; return !seen.has(k) && seen.add(k); });
  if (!items.length && !data.note) { st.textContent = "Nothing to download yet. Highlight some text first."; return; }
  const e = escapeHtml, title = $("title").textContent || "PDF";
  const para = (t) => e(t).replace(/\n/g, "<br>");
  let last = 0;
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${e(title)} - highlights</title><style>
    body { font: 11pt/1.5 Georgia, "Times New Roman", serif; color: #111; margin: 0; }
    h1 { font: 700 18pt system-ui, sans-serif; margin: 0 0 2pt; } .sub { color: #555; margin: 0 0 14pt; font-size: 10pt; }
    h2 { font: 700 10pt system-ui, sans-serif; color: #666; text-transform: uppercase; letter-spacing: .04em; margin: 14pt 0 4pt; }
    .docnote { background: #f4f6f5; padding: 8pt 10pt; border-radius: 4pt; margin-bottom: 8pt; }
    .h { break-inside: avoid; margin: 0 0 8pt; padding-left: 10pt; border-left: 4pt solid var(--c); }
    .h q { quotes: "“" "”"; } .n { margin-top: 3pt; font: 10pt/1.45 system-ui, sans-serif; color: #333;
      font-family: system-ui, "Noto Sans Bengali", "Nirmala UI", Vrinda, sans-serif; } .n::before { content: "✎ "; color: #888; }
    @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>
  <h1>${e(title)}</h1><p class="sub">${items.length} highlight${items.length === 1 ? "" : "s"} · ${new Date().toLocaleDateString("en-CA")}</p>
  ${data.note ? `<div class="docnote">${para(data.note)}</div>` : ""}
  ${items.map((x) => `${x.page !== last ? `<h2>Page ${(last = x.page)}</h2>` : ""}<div class="h" style="--c:${e(x.color)}"><q>${e(x.text)}</q>
    ${x.note ? `<div class="n">${para(x.note)}</div>` : ""}</div>`).join("")}
  </body></html>`);
  st.textContent = "In the print window, pick “Save as PDF”.";
};

// ---------- download a copy with the highlights written into the PDF ----------
$("downloadPdf").onclick = async () => {
  const btn = $("downloadPdf"), st = $("dlStatus");
  const data = notes.getData();
  if (!original || !doc) return;
  if (!data.items.length && !data.note) { st.textContent = "Nothing to add yet. Highlight some text first."; return; }
  btn.disabled = true; st.textContent = "Preparing your copy…";
  try {
    const bytes = await buildAnnotatedPdf(original, doc, data, undefined, hlAlpha);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    a.download = ($("title").textContent || "document").replace(/[\\/:*?"<>|]+/g, " ").trim() + " - highlighted.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    st.textContent = `Downloaded with ${data.items.length} highlight${data.items.length === 1 ? "" : "s"}${data.note ? " and your PDF note" : ""}.`;
  } catch (e) {
    st.textContent = "Couldn't create the PDF: " + e.message;
  } finally {
    btn.disabled = false;
  }
};
