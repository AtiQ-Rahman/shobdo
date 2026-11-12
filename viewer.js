import * as pdfjsLib from "./lib/pdf.min.mjs";
import { initAnnotations } from "./annotations.js";
import { buildAnnotatedPdf } from "./pdfexport.js";
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
let paneOpen = null;
function openSide(pane) {
  const close = !pane || paneOpen === pane;
  paneOpen = close ? null : pane;
  $("side").hidden = close;
  document.body.classList.toggle("side-open", !close);
  $("notesBtn").setAttribute("aria-pressed", String(paneOpen === "notes"));
  $("wordsBtn").setAttribute("aria-pressed", String(paneOpen === "words"));
  for (const t of document.querySelectorAll("#side [role=tab]")) t.setAttribute("aria-selected", String(t.dataset.pane === pane));
  $("paneNotes").hidden = pane !== "notes";
  $("paneWords").hidden = pane !== "words";
  setTimeout(() => { if (viewer.currentScaleValue === "page-width") viewer.currentScaleValue = "page-width"; }, 0);
}
$("notesBtn").onclick = () => openSide("notes");
$("wordsBtn").onclick = () => openSide("words");
for (const t of document.querySelectorAll("#side [role=tab]")) t.onclick = () => openSide(t.dataset.pane);
document.querySelector("#side .close").onclick = () => openSide(null);

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

    window.BPD_CTX = { title, url: url || "", docKey };
    viewer.setDocument(doc);
    linkService.setDocument(doc);
    $("pageCount").textContent = doc.numPages;
    $("title").textContent = title;
    document.title = title + " — Shobdo";
    $("timer").hidden = false;
    updateTimer();
    await notes.setDocument(doc.fingerprints[0], title);
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
  const r = Object.assign(got[docKey] || {}, record, { ms: (got[docKey]?.ms ?? record.ms) + add, t: Date.now() });
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

const sessionWords = []; // words looked up since this reader tab was opened
async function loadWords() {
  markOn = (await store.get("markSeen")).markSeen !== false;
  wordMap = await window.BPDWords.load();
  for (const w of sessionWords) window.BPDWords.add(wordMap, w);
}
addEventListener("bpd:lookup", (e) => {
  sessionWords.push(e.detail);
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

let found = [];
function renderWordList() {
  const map = new Map();
  pageTexts.forEach((t, i) => window.BPDWords.scan(wordMap, t, i + 1, map));
  found = window.BPDWords.sorted(map);
  $("wordCount").textContent = found.length ? String(found.length) : "";
  $("wordList").innerHTML = found.length ? found.map((w, i) => {
    const pages = [...w.pages];
    return `<li><button data-i="${i}">
      <span class="w${w.saved ? " saved" : " now"}">${escapeHtml(w.word)}</span><span class="c">${w.count}×</span>
      ${w.meaning ? `<span class="m">${escapeHtml(w.meaning)}</span>` : ""}
      <span class="p">Page${pages.length > 1 ? "s" : ""} ${pages.slice(0, 8).join(", ")}${pages.length > 8 ? "…" : ""}</span>
    </button></li>`;
  }).join("") : `<li class="empty">None of your saved words are in this PDF. Words you look up while reading will appear here too.</li>`;
}
const escapeHtml = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Click a word: jump to its next occurrence (clicking again moves on to the next page that has it).
const nextHit = new Map();
$("wordList").addEventListener("click", async (e) => {
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
  if (!Object.keys(c).some((k) => k.startsWith("v:") || k === "markSeen")) return;
  clearTimeout(markTimer);
  markTimer = setTimeout(async () => { await loadWords(); markAll(); if (pageTexts.length) renderWordList(); }, 300);
});
await loadWords();

// ---------- download a copy with the highlights written into the PDF ----------
$("downloadPdf").onclick = async () => {
  const btn = $("downloadPdf"), st = $("dlStatus");
  const data = notes.getData();
  if (!original || !doc) return;
  if (!data.items.length && !data.note) { st.textContent = "Nothing to add yet. Highlight some text first."; return; }
  btn.disabled = true; st.textContent = "Preparing your copy…";
  try {
    const bytes = await buildAnnotatedPdf(original, doc, data);
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
