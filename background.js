import { lookupEnglish, lookupBangla } from "./dict.js";

const VIEWER = chrome.runtime.getURL("viewer.html");
const RULE_ID = 1;
const BN_RE = /[ঀ-৿]/;

// ---- Open .pdf links in our reader (Chrome's own PDF viewer can't be scripted) ----
async function setupRules() {
  const { autoOpen = true } = await chrome.storage.local.get("autoOpen");
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: autoOpen ? [{
      id: RULE_ID,
      priority: 1,
      action: { type: "redirect", redirect: { regexSubstitution: VIEWER + "?file=\\0" } },
      condition: { regexFilter: "^(https?|file)://[^?#]*\\.[pP][dD][fF]([?#].*)?$", resourceTypes: ["main_frame"] }
    }] : []
  });
}

// Menus survive an extension reload/update, so clear them first or Chrome reports "duplicate id".
function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "open-link", title: "Open PDF link in Shobdo", contexts: ["link"] },
      () => void chrome.runtime.lastError);
  });
}
const safeRules = () => setupRules().catch((e) => console.warn("PDF redirect rule not set:", e.message));

chrome.runtime.onInstalled.addListener(() => { safeRules(); setupMenus(); });
chrome.runtime.onStartup.addListener(safeRules);
chrome.storage.onChanged.addListener((c) => { if ("autoOpen" in c) safeRules(); });
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "open-link") chrome.tabs.create({ url: VIEWER + "?file=" + info.linkUrl });
});

// ---- Online sources ----
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function google(text, sl, tl) {
  const j = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=bd&dt=rm&q=` + encodeURIComponent(text));
  const translation = (j[0] || []).map((s) => s && s[0]).filter(Boolean).join("");
  if (!translation) throw new Error("empty");
  const translit = (j[0] || []).map((s) => s && s[tl === "bn" ? 2 : 3]).filter(Boolean).join(" ");
  const dict = (j[1] || []).map((d) => ({ pos: d[0], terms: (d[1] || []).slice(0, 8) }));
  return { translation, translit, dict };
}

async function myMemory(text, sl, tl) {
  const j = await getJson(`https://api.mymemory.translated.net/get?langpair=${sl}|${tl}&q=` + encodeURIComponent(text.slice(0, 480)));
  const translation = j.responseData && j.responseData.translatedText;
  if (!translation) throw new Error(j.responseDetails || "no translation");
  const alts = [...new Set((j.matches || []).map((m) => m.translation).filter((t) => t && t !== translation))].slice(0, 6);
  return { translation, translit: "", dict: alts.length ? [{ pos: "other", terms: alts }] : [] };
}

async function translate(text, sl, tl) {
  try { return await google(text, sl, tl); } catch { return await myMemory(text, sl, tl); }
}

async function pronunciation(word) {
  try {
    const j = await getJson("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word));
    const ph = j[0].phonetics || [];
    return { phonetic: j[0].phonetic || ph.map((p) => p.text).find(Boolean) || "", audio: ph.map((p) => p.audio).find(Boolean) || "" };
  } catch { return null; }
}

// ---- Lookups ----
const online = new Map();

async function lookupOnline(text) {
  const key = text.toLowerCase();
  if (online.has(key)) return online.get(key);
  const bn = BN_RE.test(text);
  const single = !/\s/.test(text);
  const [tr, pr] = await Promise.allSettled([
    bn ? translate(text, "bn", "en") : translate(text, "en", "bn"),
    !bn && single ? pronunciation(text) : null
  ]);
  const res = {
    tr: tr.status === "fulfilled" ? tr.value : null,
    pron: pr.status === "fulfilled" ? pr.value : null,
    error: tr.status === "rejected" ? String(tr.reason.message || tr.reason) : null
  };
  if (res.tr) online.set(key, res);
  return res;
}

async function lookupOffline(text) {
  if (/\s/.test(text)) return null;
  return BN_RE.test(text) ? lookupBangla(text) : lookupEnglish(text);
}

// History of looked-up words (drives the "seen word" marks in PDFs) + today's counter.
async function record(text, lemma, meaning) {
  const w = (lemma || text).toLowerCase();
  const key = "h:" + w;
  const day = "day:" + new Date().toLocaleDateString("en-CA");
  const got = await chrome.storage.local.get([key, day]);
  const h = got[key] || { w, forms: [], n: 0 };
  const form = text.toLowerCase();
  if (!h.forms.includes(form)) h.forms.push(form);
  h.n++; h.t = Date.now();
  if (meaning) h.m = meaning;
  const d = got[day] || { ms: 0, n: 0 };
  d.n++;
  await chrome.storage.local.set({ [key]: h, [day]: d });
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type === "offline") {
    lookupOffline(msg.text).then(async (r) => {
      if (msg.record && !/\s/.test(msg.text)) await record(msg.text, r?.lemma, r?.bn?.[0] || r?.en?.[0]).catch(() => {});
      send(r);
    }, () => send(null));
    return true;
  }
  if (msg?.type === "online") {
    lookupOnline(msg.text).then(send, (e) => send({ error: String(e) }));
    return true;
  }
  if (msg?.type === "openViewer") {
    chrome.tabs.create({ url: VIEWER + (msg.file ? "?file=" + msg.file : "") });
  }
});
