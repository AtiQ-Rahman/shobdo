import { store, VIEWER, esc, dayKey, fmtTime, ago, docs, openDoc } from "./shared.js";
const $ = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const settings = await store.get(["autoOpen", "markSeen", "siteBadge", dayKey()]);
const today = settings[dayKey()] || { ms: 0, n: 0 };
$("today").textContent = `Today: ${fmtTime(today.ms)} reading · ${today.n} word${today.n === 1 ? "" : "s"} looked up`;

// Offer "open in reader" only when the current tab really is a PDF (URL ends in .pdf, or the server says so).
async function isPdf(url) {
  if (/\.pdf([?#]|$)/i.test(url)) return true;
  try {
    const r = await fetch(url, { method: "HEAD", credentials: "include" });
    return /pdf/i.test(r.headers.get("content-type") || "");
  } catch { return false; }
}
if (tab?.url && /^(https?|file):/.test(tab.url) && !tab.url.startsWith(VIEWER) && await isPdf(tab.url)) {
  $("openTab").hidden = false;
  $("openTab").onclick = () => { chrome.tabs.update(tab.id, { url: VIEWER + "?file=" + tab.url }); close(); };
}
$("openFile").onclick = () => { chrome.tabs.create({ url: VIEWER }); close(); };

const list = await docs();
$("recent").innerHTML = list.length ? list.slice(0, 5).map((d, i) => `
  <li><button data-i="${i}" title="${esc(d.url || "Opened from your computer — you'll pick the file again")}">
    <span class="t">${esc(d.title)}</span>
    <span class="m">Page ${d.page || 1} of ${d.pages || "?"} · ${fmtTime(d.ms)} · ${ago(d.t)}${d.url ? "" : " · on your computer"}</span>
    <div class="prog"><i style="width:${Math.round(100 * (d.page || 1) / (d.pages || 1))}%"></i></div>
  </button></li>`).join("") : `<li class="empty">PDFs you open will show up here.</li>`;
$("recent").onclick = (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) { openDoc(list[+b.dataset.i]); close(); }
};

$("autoOpen").checked = settings.autoOpen !== false;
$("markSeen").checked = settings.markSeen !== false;
$("autoOpen").onchange = (e) => store.set({ autoOpen: e.target.checked });
$("markSeen").onchange = (e) => store.set({ markSeen: e.target.checked });
$("siteBadge").checked = settings.siteBadge !== false;
$("siteBadge").onchange = (e) => store.set({ siteBadge: e.target.checked });
