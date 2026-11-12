// Saved webpages ("Save page to Shobdo"). Used by the background worker, the toolbar menu, the Library and the reader.
// Storage, per page id:
//   "page:<id>"    { title, name?, url, site, byline, excerpt, chars, sel, saved, first, t, ms, pos }
//   "ptext:<id>"   { html }  — the cleaned article, kept apart so lists stay light
//   "ann:pg-<id>"  { items, note } — highlights and notes, same shape as a PDF's "ann:<fingerprint>"
export const READER = chrome.runtime.getURL("reader.html");

// Same page = same address, ignoring the #part and tracking parameters.
export function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_\w+|fbclid|gclid|dclid|mc_cid|mc_eid|igshid)$/i.test(k)) x.searchParams.delete(k);
    return x.href;
  } catch { return String(u || ""); }
}

// Short stable id (two FNV-1a hashes → 13 base-36 characters).
function hash(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(36).padStart(7, "0") + b.toString(36).padStart(7, "0").slice(-6);
}
export const pageId = (url, extra = "") => hash(normUrl(url) + (extra ? "\u0000" + extra : ""));
export const pageKeys = (id) => ["page:" + id, "ptext:" + id, "ann:pg-" + id];
export const annKey = (id) => "ann:pg-" + id;

export function pagesFrom(all) {
  return Object.entries(all).filter(([k]) => k.startsWith("page:")).map(([k, v]) => {
    const id = k.slice(5), ann = all[annKey(id)];
    return { key: k, id, ...v, title: v.name || v.title, original: v.title, highlights: ann?.items?.length || 0, hasNote: !!ann?.note };
  }).sort((a, b) => (b.t || b.saved || 0) - (a.t || a.saved || 0));
}

// Page titles often carry the site's name ("How to read slowly | The Reading Room", "Reading - Wikipedia").
// Drop the parts that name the site; if none clearly does, drop a short last part after " | " (usually the brand).
export function shortTitle(title, site = "") {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  const parts = t.split(/\s+[|–—·•»]\s+|\s+-\s+/);
  if (parts.length < 2) return t;
  const squash = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const host = squash(String(site).replace(/^www\./i, "").replace(/\.[a-z]{2,}(\.[a-z]{2})?$/i, "")); // "bbc.co.uk" → "bbc"
  const isSite = (x) => { const q = squash(x); return q.length > 1 && host.length > 1 && (q.includes(host) || host.includes(q)); };
  const keep = parts.filter((x) => !isSite(x));
  if (keep.length && keep.length < parts.length) return keep.join(" – ");
  if (/\s\|\s/.test(t) && parts[parts.length - 1].split(" ").length <= 4) return parts.slice(0, -1).join(" – ");
  return t;
}

export function openPage(id, newTab = true) {
  const url = READER + "?id=" + id;
  return newTab ? chrome.tabs.create({ url }) : chrome.tabs.update({ url });
}

// Reads the page in tab `tabId` and stores it. mode: "page" (the main article) or "selection".
// Saving the same page again replaces the text but keeps your highlights, notes, name and reading time.
// name: your own name for it (optional); otherwise the page's title, shortened.
export async function savePage(tabId, mode = "page", name = "") {
  let result;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!/^(https?|file):/.test(tab.url || "")) return { error: "Shobdo can't save this kind of page." };
    if (tab.url.startsWith(READER)) return { error: "This page is already saved." };
    await chrome.scripting.executeScript({ target: { tabId }, files: ["lib/Readability.js", "sanitize.js", "extract.js"] });
    [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: (m) => window.__shobdoExtract(m), args: [mode] });
  } catch (e) {
    return { error: /file/i.test(String(e?.message)) ? "To save files from your computer, turn on “Allow access to file URLs” for Shobdo in chrome://extensions."
      : "Chrome doesn't let extensions read this page." };
  }
  if (!result || result.error) return { error: result?.error || "Couldn't read this page." };
  const { html, ...meta } = result;
  const id = pageId(meta.url, mode === "selection" ? html.slice(0, 2000) : "");
  const key = "page:" + id;
  const old = (await chrome.storage.local.get(key))[key];
  const now = Date.now();
  meta.title = shortTitle(meta.title, meta.site) || meta.title;
  const rec = { ms: 0, pos: 0, first: now, t: now, ...old, ...meta, sel: mode === "selection", saved: now };
  delete rec.name;
  const n = String(name || old?.name || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (n && n !== rec.title) rec.name = n;
  await chrome.storage.local.set({ [key]: rec, ["ptext:" + id]: { html } });
  return { ok: true, id, title: rec.name || rec.title, updated: !!old };
}
