import { store, VIEWER, esc, dayKey, fmtTime, ago, docs, openDoc, renameDoc } from "./shared.js";
import { pageId, pagesFrom, openPage, shortTitle } from "./pages.js";
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
else if (tab?.url && /^(https?|file):/.test(tab.url)) setupSave(tab);
$("openFile").onclick = () => { chrome.tabs.create({ url: VIEWER }); close(); };

// ---------- save this page ----------
async function setupSave(tab) {
  const id = pageId(tab.url), key = "page:" + id;
  const show = (saved) => { $("savePage").hidden = saved; $("savedRow").hidden = !saved; };
  // The name box: before saving it suggests a short title; once saved, changing it renames the saved copy.
  const rec = (await store.get(key))[key];
  let savedId = rec ? id : null, edited = false;
  const name = $("saveName");
  name.value = rec ? rec.name || rec.title : shortTitle(tab.title || "", new URL(tab.url).hostname);
  $("nameRow").hidden = false;
  show(!!rec);
  name.oninput = () => { edited = true; };
  const rename = async () => {
    if (!savedId || !edited) return;
    edited = false;
    await renameDoc("page:" + savedId, name.value);
    $("saveMsg").className = "save-msg"; $("saveMsg").textContent = "Name saved.";
  };
  name.onkeydown = (e) => { if (e.key === "Enter") { if (savedId) rename(); else $("savePage").click(); } };
  name.onblur = rename;
  $("openSaved").onclick = () => { openPage(id); close(); };
  const save = async (btn) => {
    const msg = $("saveMsg");
    btn.disabled = true; msg.className = "save-msg"; msg.textContent = "Saving…";
    const r = await chrome.runtime.sendMessage({ type: "savePage", tabId: tab.id, name: edited || savedId ? name.value : "" }).catch((e) => ({ error: e.message }));
    btn.disabled = false;
    if (r?.ok) {
      msg.textContent = r.updated ? "Saved again. Your highlights and notes are kept." : "Saved. Find it any time in Library → Saved pages.";
      $("openSaved").onclick = () => { openPage(r.id); close(); };
      savedId = r.id; edited = false;
      if (document.activeElement !== name) name.value = r.title;
      show(true);
    } else { msg.className = "save-msg err"; msg.textContent = r?.error || "Couldn't save this page."; }
  };
  $("savePage").onclick = (e) => save(e.currentTarget);
  $("resave").onclick = (e) => save(e.currentTarget);
}

// ---------- recent saved pages ----------
const pages = pagesFrom(await store.get(null)).slice(0, 3);
$("pagesSec").hidden = !pages.length;
$("pages").innerHTML = pages.map((p, i) => `
  <li><button data-p="${i}" title="${esc(p.url)}">
    <span class="t">${esc(p.title)}</span>
    <span class="m">${esc(p.site || "")}${p.site ? " · " : ""}${p.ms ? fmtTime(p.ms) + " · " : ""}saved ${ago(p.saved)}</span>
  </button></li>`).join("");
$("pages").onclick = (e) => {
  const b = e.target.closest("button[data-p]");
  if (b) { openPage(pages[+b.dataset.p].id); close(); }
};

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
