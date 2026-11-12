import { store, esc, dayKey, fmtTime, ago, docsFrom, openDoc, watchTextSize, TEXT_SIZES, DEFAULT_UI_FS } from "./shared.js";
watchTextSize();
const $ = (id) => document.getElementById(id);

// ---------- tabs ----------
function showTab() {
  const id = (location.hash || "#pdfs").slice(1);
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== id;
  for (const a of document.querySelectorAll("nav a")) a.setAttribute("aria-selected", String(a.dataset.tab === id));
}
addEventListener("hashchange", showTab);
showTab();

// ---------- PDFs ----------
let docList = [];
function renderDocs(all) {
  docList = docsFrom(all);
  $("docList").innerHTML = docList.length ? docList.map((d, i) => `
    <li class="card">
      <span class="t">${esc(d.title)}</span>
      <span class="m">Page ${d.page || 1} of ${d.pages || "?"} · ${fmtTime(d.ms)} reading · last opened ${ago(d.t)}${d.highlights ? ` · ${d.highlights} highlight${d.highlights === 1 ? "" : "s"}` : ""}${d.hasNote ? " · has notes" : ""}${d.url ? "" : " · opened from your computer"}</span>
      <div class="prog"><i style="width:${Math.round(100 * (d.page || 1) / (d.pages || 1))}%"></i></div>
      <span class="acts">
        <button class="btn primary" data-open="${i}" title="${d.url ? "Continue where you left off" : "Opens the reader; pick the same file again and your page, notes and highlights come back"}">Continue reading</button>
        <button class="btn danger" data-del="${i}" title="Remove from history, including its highlights and notes">Remove</button>
      </span>
    </li>`).join("") : `<li class="empty">No PDFs yet. Open a PDF and it will show up here, with your page, reading time and notes.</li>`;
}
$("docList").onclick = async (e) => {
  const o = e.target.closest("[data-open]"), d = e.target.closest("[data-del]");
  if (o) openDoc(docList[+o.dataset.open]);
  if (d) {
    const doc = docList[+d.dataset.del];
    if (!confirm(`Remove “${doc.title}” from your history? Its highlights and notes will be deleted too.`)) return;
    await store.remove([doc.key, "ann:" + doc.key.slice(4)]); // the storage listener re-renders
  }
};

// ---------- My words ----------
let words = [];
// Recall mode: meanings stay hidden until clicked, so you can test yourself first.
let recall = false;
const revealed = new Set();
$("recallToggle").onchange = (e) => store.set({ recall: e.target.checked }); // the storage listener re-renders
$("showAll").onclick = () => { for (const w of words) revealed.add(w.key); renderWords(); };
function loadWords(all) {
  if ((all.recall !== false) !== recall) { recall = all.recall !== false; revealed.clear(); } // on unless turned off
  $("recallToggle").checked = recall;
  $("showAll").hidden = !recall;
  words = Object.entries(all).filter(([k]) => k.startsWith("v:")).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.t - a.t);
  rv = {};
  for (const w of words) if (all["r" + w.key]) rv[w.key] = all["r" + w.key];
  renderReviseSetup();
  $("wordCount").textContent = words.length ? `(${words.length})` : "";
  renderWords();
}
function sentenceHtml(w) {
  if (!w.sentence) return "";
  const i = w.sentence.toLowerCase().indexOf(w.w.toLowerCase());
  if (i < 0) return esc(w.sentence);
  return esc(w.sentence.slice(0, i)) + `<mark>${esc(w.sentence.slice(i, i + w.w.length))}</mark>` + esc(w.sentence.slice(i + w.w.length));
}
const bnHtml = (w) => `<span class="bn">${esc(w.meaning)}</span>${w.more?.length > 1 ? `<span class="bn muted">${esc(w.more.filter((x) => x !== w.meaning).slice(0, 4).join(", "))}</span>` : ""}`;
const defHtml = (w) => (w.def ? `<span class="def"><i>${esc(w.pos)}</i>${esc(w.def)}</span>` : "");
function renderWords() {
  const q = $("q").value.trim().toLowerCase();
  const shown = words.filter((w) => !q || [w.w, w.meaning, w.def, ...(w.more || [])].join(" ").toLowerCase().includes(q));
  $("wordList").innerHTML = shown.length ? shown.map((w) => `
    <li class="card">${recall && !revealed.has(w.key) ? `
      <span class="w"><span class="word">${esc(w.w)}</span></span>
      <button class="reveal" data-k="${esc(w.key)}" title="Click to show the meaning" aria-label="Show the meaning of ${esc(w.w)}"><span class="rv" aria-hidden="true"><span class="w">${bnHtml(w)}</span>${defHtml(w)}</span></button>` : `
      <span class="w"><span class="word">${esc(w.w)}</span>${bnHtml(w)}</span>
      ${defHtml(w)}`}
      ${w.sentence ? `<span class="sent">${sentenceHtml(w)}</span>` : ""}
      <span class="m">${esc(w.src?.title || "")}${w.src?.title ? " · " : ""}saved ${ago(w.t)}${rv[w.key] ? `<span class="stat-rv"> · revised: knew ${rv[w.key].ok || 0}, missed ${rv[w.key].miss || 0}</span>` : ""}</span>
      <span class="acts"><button class="btn danger" data-del="${esc(w.key)}">Remove</button></span>
    </li>`).join("") : `<li class="empty">${words.length ? "No saved word matches your search." : "No saved words yet. Double-click a word and press the bookmark button in its meaning box."}</li>`;
}
$("q").oninput = renderWords;
$("wordList").onclick = async (e) => {
  const r = e.target.closest("[data-k]");
  if (r) { revealed.add(r.dataset.k); renderWords(); return; }
  const d = e.target.closest("[data-del]");
  if (d) await store.remove([d.dataset.del, "r" + d.dataset.del]); // the word and its revise record; the storage listener re-renders
};
$("csv").onclick = () => {
  const cell = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
  const rows = words.map((w) => [w.w, [w.meaning, w.def && `(${w.pos}) ${w.def}`, w.sentence].filter(Boolean).join("<br>")]);
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "my-words.csv";
  a.click();
};

// ---------- Reading time ----------
function renderTime(all) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const v = all[dayKey(d)] || { ms: 0, n: 0 };
    days.push({ d, ms: v.ms, n: v.n });
  }
  const week = days.slice(7).reduce((s, x) => s + x.ms, 0);
  const total = Object.entries(all).filter(([k]) => k.startsWith("day:")).reduce((s, [, v]) => s + (v.ms || 0), 0);
  const savedCount = Object.keys(all).filter((k) => k.startsWith("v:")).length;
  $("stats").innerHTML = [
    [fmtTime(days[13].ms), `today · ${days[13].n} words looked up`],
    [fmtTime(week), "last 7 days"],
    [fmtTime(total), "all time"],
    [String(savedCount), "saved words"]
  ].map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("");

  const max = Math.max(...days.map((x) => x.ms), 60000);
  const label = (x) => x.d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  $("chart").setAttribute("aria-label", "Minutes read per day: " + days.map((x) => `${label(x)} ${Math.floor(x.ms / 60000)} min`).join(", "));
  const peak = days.reduce((a, b) => (b.ms > a.ms ? b : a));
  $("chart").innerHTML = `<div class="bars">${days.map((x) => {
    const h = (x.ms / max) * 100;
    const showVal = (x === peak && x.ms >= 60000) || x === days[13];
    return `<div class="bar" tabindex="0"><i style="height:${h}%"></i>${showVal && x.ms >= 60000 ? `<span class="val" style="bottom:calc(${h}% + 2px)">${Math.floor(x.ms / 60000)}m</span>` : ""}<span class="tip">${esc(label(x))}: ${fmtTime(x.ms)}</span></div>`;
  }).join("")}</div>
  <div class="days">${days.map((x, i) => `<span>${i === 13 ? "Today" : x.d.toLocaleDateString(undefined, { weekday: "narrow" })}</span>`).join("")}</div>`;

  const per = docsFrom(all).filter((d) => d.ms > 0).sort((a, b) => b.ms - a.ms);
  $("perDoc").innerHTML = per.length ? per.map((d) => `<li><span class="name">${esc(d.title)}</span><span class="v">${fmtTime(d.ms)}</span></li>`).join("")
    : `<li class="muted">Time you spend reading PDFs in the reader is counted here.</li>`;
}

// ---------- Backup / restore ----------
// Backup format id. Frozen: it predates the "Shobdo" rename and every existing backup file carries it,
// so changing it would make old backups unrestorable.
const APP = "bangla-pdf-dict";
function summarize(data) {
  const c = (p) => Object.keys(data).filter((k) => k.startsWith(p)).length;
  const hl = Object.entries(data).filter(([k]) => k.startsWith("ann:")).reduce((n, [, v]) => n + (v.items?.length || 0), 0);
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  return `${pl(c("v:"), "saved word", "saved words")}, ${pl(c("doc:"), "PDF", "PDFs")}, ${pl(hl, "highlight", "highlights")}, ${pl(c("day:"), "day", "days")} of reading time`;
}
function renderBackupSummary(all) {
  $("backupSummary").textContent = "Right now you have " + summarize(all) + ".";
}
function downloadBackup(data, name = `shobdo-backup-${new Date().toLocaleDateString("en-CA")}.json`) {
  const file = { app: APP, version: 1, exported: new Date().toISOString(), data };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$("backupBtn").onclick = async () => downloadBackup(await store.get(null));

let pending = null;
$("pickBtn").onclick = () => $("restoreFile").click();
$("restoreFile").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  $("restoreStatus").textContent = "";
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== APP || !j.data || typeof j.data !== "object") throw new Error("not a backup from this extension");
    pending = j.data;
    const when = new Date(j.exported);
    $("restoreInfo").textContent = `This backup is from ${isNaN(when) ? "an unknown date" : when.toLocaleString()} and has ${summarize(pending)}.`;
    $("restorePreview").hidden = false;
  } catch (err) {
    pending = null;
    $("restorePreview").hidden = true;
    $("restoreStatus").textContent = "Couldn't read that file: " + err.message + ".";
  }
};
$("cancelRestore").onclick = () => { pending = null; $("restorePreview").hidden = true; };

// Merge rules: newer saved word wins; reading time keeps the larger number (never adds, so restoring
// the same file twice doesn't double it); highlights are combined by id; settings already here win.
function mergeValue(k, mine, theirs) {
  if (mine === undefined) return theirs;
  if (k.startsWith("v:")) return (theirs.t || 0) > (mine.t || 0) ? theirs : mine;
  if (k.startsWith("h:")) return { ...mine, ...theirs, forms: [...new Set([...(mine.forms || []), ...(theirs.forms || [])])], n: Math.max(mine.n || 0, theirs.n || 0), t: Math.max(mine.t || 0, theirs.t || 0), m: mine.m || theirs.m };
  if (k.startsWith("rv:")) return (theirs.last || 0) > (mine.last || 0) ? theirs : mine;
  if (k.startsWith("day:")) return { ms: Math.max(mine.ms || 0, theirs.ms || 0), n: Math.max(mine.n || 0, theirs.n || 0) };
  if (k.startsWith("doc:")) {
    const newer = (theirs.t || 0) > (mine.t || 0) ? theirs : mine;
    return { ...mine, ...theirs, ms: Math.max(mine.ms || 0, theirs.ms || 0), page: newer.page, t: newer.t, url: mine.url || theirs.url, first: Math.min(mine.first || Infinity, theirs.first || Infinity) };
  }
  if (k.startsWith("ann:")) {
    const ids = new Set((mine.items || []).map((x) => x.id));
    const a = (mine.note || "").trim(), b = (theirs.note || "").trim();
    return { items: [...(mine.items || []), ...(theirs.items || []).filter((x) => !ids.has(x.id))], note: !b || a.includes(b) ? a : !a ? b : a + "\n\n" + b };
  }
  return mine; // settings: keep the ones on this computer
}

$("restoreBtn").onclick = async () => {
  if (!pending) return;
  const mode = document.querySelector("input[name=mode]:checked").value;
  if (mode === "replace" && !confirm("Delete everything here and use only the backup? This can't be undone.")) return;
  restoring = true; // hold re-renders until the restore is finished, so nothing half-done is shown
  const before = await store.get(null);
  try {
    if (mode === "replace") {
      // Write the backup first and only then remove what it doesn't have: if the write fails,
      // nothing was deleted.
      await store.set(pending);
      const extra = Object.keys(before).filter((k) => !(k in pending));
      if (extra.length) await store.remove(extra);
    } else {
      const out = {};
      for (const [k, v] of Object.entries(pending)) out[k] = mergeValue(k, before[k], v);
      await store.set(out);
    }
    pending = null;
    $("restorePreview").hidden = true;
    $("restoreStatus").textContent = mode === "replace" ? "Restored. Your data now matches the backup." : "Restored. The backup was merged with your data.";
  } catch (err) {
    // Put back exactly what was there before; if even that fails, hand the user their old data as a file.
    try {
      await store.set(before);
      const added = Object.keys(await store.get(null)).filter((k) => !(k in before));
      if (added.length) await store.remove(added);
      $("restoreStatus").textContent = "Restore failed: " + err.message + ". Your data wasn't changed.";
    } catch {
      downloadBackup(before, `shobdo-before-restore-${new Date().toLocaleDateString("en-CA")}.json`);
      $("restoreStatus").textContent = "Restore failed: " + err.message + ", and your earlier data couldn't be put back. " +
        "It was saved as a backup file (shobdo-before-restore-…json); restore it with Replace to get it back.";
    }
  } finally {
    restoring = false;
    refresh(ALL);
  }
};

// ---------- Rendering ----------
// One storage read feeds every section that needs updating. Runs are queued one after another, so an
// older snapshot can never finish last and overwrite a newer one; bursts of writes are batched.
// ---------- Text size for My words + Revise ----------
const WFS_MIN = 12, WFS_MAX = 26;
let wordsFs = 14;
function applyWordsFs() {
  for (const id of ["words", "revise"]) $(id).style.setProperty("--wf", wordsFs / 14);
  $("s-wfs").textContent = Math.round(wordsFs / 14 * 100) + "%";
  for (const b of document.querySelectorAll("[data-fs]")) b.disabled = +b.dataset.fs < 0 ? wordsFs <= WFS_MIN : wordsFs >= WFS_MAX;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-fs]");
  if (b) store.set({ wordsFs: Math.min(WFS_MAX, Math.max(WFS_MIN, wordsFs + +b.dataset.fs)) });
});

// ---------- Revise ----------
// Flashcards from your saved words. Each word's record lives in "rv:<lemma>" = { ok, miss, last, lastOk }.
const DAY = 864e5;
let rv = {};               // "v:<lemma>" -> revise record
let round = null;          // { list, i, shown, missed: [], knew: 0, dir }
let rvPrefs = { pool: "d7", count: 10, order: "random", dir: "word" };
const SPEAK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const isEn = (s) => /^[A-Za-z][A-Za-z'’ -]*$/.test(s || "");

function pools() {
  const now = Date.now();
  return {
    d7: words.filter((w) => now - (w.t || 0) < 7 * DAY),
    d30: words.filter((w) => now - (w.t || 0) < 30 * DAY),
    all: words,
    missed: words.filter((w) => rv[w.key]?.lastOk === false)
  };
}
function renderReviseSetup() {
  const p = pools();
  for (const el of document.querySelectorAll("#rvPool [data-n]")) el.textContent = `(${p[el.dataset.n].length})`;
  for (const [name, v] of [["rvPool", rvPrefs.pool], ["rvCount", String(rvPrefs.count)], ["rvOrder", rvPrefs.order], ["rvDir", rvPrefs.dir]])
    for (const r of document.querySelectorAll(`input[name=${name}]`)) r.checked = r.value === v;
  const n = p[rvPrefs.pool].length, take = rvPrefs.count ? Math.min(rvPrefs.count, n) : n;
  $("rvStart").disabled = !take;
  $("rvInfo").textContent = !words.length ? "Save some words first: double-click a word and press the bookmark button."
    : !n ? "No words in this group yet. Pick another one." : `${take} word${take === 1 ? "" : "s"} in this round.`;
}
$("rvSetup").addEventListener("change", (e) => {
  const t = e.target;
  if (t.name === "rvPool") rvPrefs.pool = t.value;
  if (t.name === "rvCount") rvPrefs.count = +t.value;
  if (t.name === "rvOrder") rvPrefs.order = t.value;
  if (t.name === "rvDir") rvPrefs.dir = t.value;
  store.set({ rvPrefs });
  renderReviseSetup();
});

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickWords() {
  let list = shuffle([...pools()[rvPrefs.pool]]); // shuffled first, so ties in the sorts below are random too
  if (rvPrefs.order === "newest") list.sort((a, b) => (b.t || 0) - (a.t || 0));
  if (rvPrefs.order === "hardest") {
    const hard = (w) => { const r = rv[w.key]; return r ? (r.miss || 0) - (r.ok || 0) + (r.lastOk === false ? 2 : 0) : 0.5; };
    list.sort((a, b) => hard(b) - hard(a));
  }
  return rvPrefs.count ? list.slice(0, rvPrefs.count) : list;
}
function startRound(list) {
  if (!list.length) return;
  round = { list, i: 0, shown: false, missed: [], knew: 0, dir: rvPrefs.dir };
  $("rvSetup").hidden = true; $("rvDone").hidden = true; $("rvCard").hidden = false;
  showCard();
}
$("rvStart").onclick = () => startRound(pickWords());

function speakBtn(w) { return isEn(w.w) ? `<button class="say" data-say="${esc(w.w)}" title="Pronounce" aria-label="Pronounce ${esc(w.w)}">${SPEAK}</button>` : ""; }
function showCard() {
  const w = round.list[round.i], n = round.list.length;
  $("rvProg").textContent = `${round.i + 1} / ${n}`;
  $("rvBar").style.width = (100 * round.i / n) + "%";
  const word = `<span class="big${isEn(w.w) ? "" : " bn"}">${esc(w.w)}${speakBtn(w)}</span>`;
  const meaning = `<span class="ans bn">${esc(w.meaning)}</span>`;
  const more = w.more?.length > 1 ? `<span class="bn muted more">${esc(w.more.filter((x) => x !== w.meaning).slice(0, 4).join(", "))}</span>` : "";
  const sent = w.sentence ? `<span class="sent">${sentenceHtml(w)}</span>` : "";
  if (round.dir === "word") {
    $("rvQ").innerHTML = word + sent; // the sentence gives context but not the meaning
    $("rvA").innerHTML = meaning + more + defHtml(w);
  } else {
    $("rvQ").innerHTML = `<span class="big bn">${esc(w.meaning)}</span>` + more + defHtml(w);
    $("rvA").innerHTML = `<span class="ans">${esc(w.w)}${speakBtn(w)}</span>` + sent;
  }
  round.shown = false;
  $("rvA").hidden = true; $("rvShow").hidden = false; $("rvJudge").hidden = true;
  $("rvShow").focus({ preventScroll: true });
}
function reveal() {
  if (!round || round.shown) return;
  round.shown = true;
  $("rvA").hidden = false; $("rvShow").hidden = true; $("rvJudge").hidden = false;
  $("rvYes").focus({ preventScroll: true });
}
function judge(knew) {
  if (!round || !round.shown) return;
  const w = round.list[round.i];
  const r = { ...(rv[w.key] || {}) };
  r[knew ? "ok" : "miss"] = (r[knew ? "ok" : "miss"] || 0) + 1;
  r.last = Date.now(); r.lastOk = knew;
  rv[w.key] = r;
  store.set({ ["r" + w.key]: r });
  if (knew) round.knew++; else round.missed.push(w);
  round.i++;
  if (round.i < round.list.length) showCard(); else finish();
}
function finish() {
  const n = round.list.length, m = round.missed;
  $("rvCard").hidden = true; $("rvDone").hidden = false;
  $("rvDone").innerHTML = `
    <h2>${m.length ? "Round done" : "All correct!"}</h2>
    <p class="score">You knew <b>${round.knew}</b> of ${n}.${m.length === 1 ? " This one needs another look:" : m.length ? ` These ${m.length} need another look:` : ""}</p>
    ${m.length ? `<ul>${m.map((w) => `<li><b>${esc(w.w)}</b><span class="bn">${esc(w.meaning)}</span>${w.def ? `<span class="def">${esc(w.def)}</span>` : ""}</li>`).join("")}</ul>` : ""}
    <div class="acts">
      ${m.length ? `<button class="btn primary" data-rv="again">Revise the ${m.length === 1 ? "missed word" : m.length + " missed words"} again</button>` : ""}
      <button class="btn${m.length ? "" : " primary"}" data-rv="new">New round</button>
      <button class="btn" data-rv="setup">Change words</button>
    </div>`;
  $("rvDone").querySelector(".btn").focus({ preventScroll: true });
}
$("rvDone").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rv]");
  if (!b) return;
  if (b.dataset.rv === "again") startRound(shuffle([...round.missed]));
  else if (b.dataset.rv === "new") startRound(pickWords());
  else endRound();
});
function endRound() {
  round = null;
  $("rvCard").hidden = true; $("rvDone").hidden = true; $("rvSetup").hidden = false;
  renderReviseSetup();
}
$("rvShow").onclick = reveal;
$("rvYes").onclick = () => judge(true);
$("rvNo").onclick = () => judge(false);
$("rvQuit").onclick = () => { if (round && round.i > 0) finishEarly(); else endRound(); };
function finishEarly() { round.list = round.list.slice(0, round.i); finish(); }
$("revise").addEventListener("click", (e) => {
  const s = e.target.closest("[data-say]");
  if (!s) return;
  const u = new SpeechSynthesisUtterance(s.dataset.say); u.lang = "en-US";
  speechSynthesis.cancel(); speechSynthesis.speak(u);
});
document.addEventListener("keydown", (e) => {
  if ($("revise").hidden || $("rvCard").hidden || !round || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest("input, textarea")) return;
  if ((e.key === " " || e.key === "Enter") && !round.shown) { e.preventDefault(); reveal(); }
  else if (round.shown && (e.key === "2" || e.key === "ArrowRight")) { e.preventDefault(); judge(true); }
  else if (round.shown && (e.key === "1" || e.key === "ArrowLeft")) { e.preventDefault(); judge(false); }
  else if (e.key === "Escape") $("rvQuit").click();
});

// ---------- Settings ----------
// Every setting lives in chrome.storage.local; the reader, websites and popup all listen for changes.
const SETTINGS = ["uiFs", "autoOpen", "markSeen", "siteBadge", "recall", "hlAlpha", "sideFs", "sideW", "wordsFs", "rvPrefs"];
const FS_MIN = 12, FS_MAX = 24;
let sideFs = 14;
function renderSettings(all) {
  for (const k of ["autoOpen", "markSeen", "siteBadge", "recall"]) $("s-" + k).checked = all[k] !== false; // all default on
  const a = String(all.hlAlpha || 0.4);
  for (const r of document.querySelectorAll("input[name=hlAlpha]")) r.checked = r.value === a;
  sideFs = all.sideFs || 14;
  $("s-fs").textContent = Math.round(sideFs / 14 * 100) + "%";
  const ui = String(all.uiFs || DEFAULT_UI_FS);
  for (const r of document.querySelectorAll("input[name=uiFs]")) r.checked = r.value === ui;
  $("s-fsDown").disabled = sideFs <= FS_MIN;
  $("s-fsUp").disabled = sideFs >= FS_MAX;
  $("s-wReset").disabled = !all.sideW;
  wordsFs = all.wordsFs || 14;
  applyWordsFs();
  if (all.rvPrefs) { rvPrefs = { ...rvPrefs, ...all.rvPrefs }; if (!round) renderReviseSetup(); }
}
$("s-uiFs").insertAdjacentHTML("beforeend", TEXT_SIZES.map(([px, name]) =>
  `<label><input type="radio" name="uiFs" value="${px}"> <span style="font-size:${px}px">${name} <span class="bn">অআ</span></span></label>`).join(""));
$("s-uiFs").onchange = (e) => store.set({ uiFs: +e.target.value });
for (const k of ["autoOpen", "markSeen", "siteBadge", "recall"]) $("s-" + k).onchange = (e) => store.set({ [k]: e.target.checked });
$("s-hlAlpha").onchange = (e) => store.set({ hlAlpha: +e.target.value });
$("s-fsDown").onclick = () => store.set({ sideFs: Math.max(FS_MIN, sideFs - 1) });
$("s-fsUp").onclick = () => store.set({ sideFs: Math.min(FS_MAX, sideFs + 1) });
$("s-wReset").onclick = () => store.remove("sideW");

const ALL = ["docs", "words", "time", "backup", "settings"];
const RENDER = { docs: renderDocs, words: loadWords, time: renderTime, backup: renderBackupSummary, settings: renderSettings };
let restoring = false, dirty = new Set(), timer = 0, queue = Promise.resolve();
function refresh(parts) {
  for (const p of parts) dirty.add(p);
  if (restoring) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const run = [...dirty]; dirty = new Set();
    queue = queue.then(async () => {
      const all = await store.get(null);
      for (const p of run) RENDER[p](all);
    }).catch((e) => console.error(e));
  }, 50);
}
function partsFor(keys) {
  const s = new Set();
  for (const k of keys) {
    if (k.startsWith("doc:") || k.startsWith("ann:")) s.add("docs").add("time").add("backup");
    else if (k === "recall") s.add("words").add("settings");
    else if (SETTINGS.includes(k)) s.add("settings");
    else if (k.startsWith("rv:")) s.add("words").add("backup");
    else if (k.startsWith("v:")) s.add("words").add("time").add("backup");
    else if (k.startsWith("day:")) s.add("time").add("backup");
  }
  return s;
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local") refresh(partsFor(Object.keys(changes))); });
refresh(ALL);
