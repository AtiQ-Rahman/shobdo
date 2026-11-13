import { lookupEnglish, lookupBangla } from "./dict.js";
import { savePage, openPage, pageId, normUrl } from "./pages.js";
import { renameDoc } from "./shared.js";

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
    const ok = () => void chrome.runtime.lastError;
    chrome.contextMenus.create({ id: "open-link", title: "Open PDF link in Shobdo", contexts: ["link"] }, ok);
    chrome.contextMenus.create({ id: "save-page", title: "Save page to Shobdo", contexts: ["page"], documentUrlPatterns: ["http://*/*", "https://*/*", "file://*/*"] }, ok);
    chrome.contextMenus.create({ id: "save-selection", title: "Save selected text to Shobdo", contexts: ["selection"], documentUrlPatterns: ["http://*/*", "https://*/*", "file://*/*"] }, ok);
  });
}
const safeRules = () => setupRules().catch((e) => console.warn("PDF redirect rule not set:", e.message));

chrome.runtime.onInstalled.addListener(() => { safeRules(); setupMenus(); });
chrome.runtime.onStartup.addListener(safeRules);
chrome.storage.onChanged.addListener((c) => { if ("autoOpen" in c) safeRules(); });
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "open-link") chrome.tabs.create({ url: VIEWER + "?file=" + info.linkUrl });
  if ((info.menuItemId === "save-page" || info.menuItemId === "save-selection") && tab?.id >= 0) {
    const r = await savePage(tab.id, info.menuItemId === "save-page" ? "page" : "selection");
    tell(tab.id, r);
  }
});
// Show "Saved" (or why not) on the page itself; site.js draws the message.
function tell(tabId, r) {
  chrome.tabs.sendMessage(tabId, { type: "shobdoSaved", ...r }, { frameId: 0 }).catch(() => {});
}

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

// ---- Pronunciation ----
// Speaking from the page is unreliable: page CSP can block audio and Chrome on Linux often drops
// Web Speech utterances. Play audio in an offscreen document instead, with chrome.tts as a last resort.
async function playAudio(urls) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Play word pronunciation" })
      .catch(() => {}); // another call may have created it meanwhile
  }
  return chrome.runtime.sendMessage({ target: "offscreen", type: "play", urls });
}

// Dictionary recordings are often missing, and system speech needs speech-dispatcher on Linux,
// so Google Translate's voice sits in between.
async function speak(text, audio) {
  const gtts = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" + encodeURIComponent(text.slice(0, 200));
  if (await playAudio([audio, gtts].filter(Boolean)).catch(() => false)) return;
  chrome.tts.stop();
  chrome.tts.speak(text, { lang: "en-US", rate: 0.9 });
}

// Google search / Translate open in one small window beside the page instead of a new tab.
// (They can't be shown inside the meaning box: Google refuses to be embedded in other pages.)
let peekWin = null;
async function peek(url, fromWin) {
  if (peekWin != null) {
    try {
      const w = await chrome.windows.get(peekWin, { populate: true });
      await chrome.tabs.update(w.tabs[0].id, { url });
      await chrome.windows.update(peekWin, { focused: true });
      return;
    } catch { peekWin = null; }
  }
  const W = 480, H = 720, opts = { url, type: "popup", width: W, height: H };
  try {
    const f = await chrome.windows.get(fromWin);
    opts.left = Math.max(0, f.left + f.width - W - 16);
    opts.top = f.top + 80;
    opts.height = Math.min(H, Math.max(400, f.height - 100));
  } catch {}
  peekWin = (await chrome.windows.create(opts)).id;
}
chrome.windows.onRemoved.addListener((id) => { if (id === peekWin) peekWin = null; });

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg?.type === "peek" && /^https:\/\/(www|translate)\.google\.com\//.test(msg.url || "")) {
    peek(msg.url, sender.tab?.windowId);
  }
  if (msg?.type === "speak") {
    speak(msg.text, msg.audio).finally(() => send(true));
    return true;
  }
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
  if (msg?.type === "savePage") {
    const tabId = msg.tabId ?? sender.tab?.id;
    savePage(tabId, msg.mode || "page", msg.name).then((r) => { if (!msg.tabId) tell(tabId, r); send(r); });
    return true;
  }
  if (msg?.type === "pageStatus") {
    // Is this address saved, and how many of your saved words came from it?
    const id = pageId(msg.url), url = normUrl(msg.url);
    chrome.storage.local.get(null).then((all) => send({
      id, saved: !!all["page:" + id],
      fromHere: Object.entries(all).filter(([k, v]) => k.startsWith("v:") && v.src?.url && normUrl(v.src.url) === url).length
    }));
    return true;
  }
  if (msg?.type === "openPage" && msg.id) openPage(msg.id);
  if (msg?.type === "renamePage" && msg.id) { renameDoc("page:" + msg.id, msg.name).then(() => send(true)); return true; }
  if (msg?.type === "openViewer") {
    chrome.tabs.create({ url: VIEWER + (msg.file ? "?file=" + msg.file : "") });
  }
});
