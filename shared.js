// Small helpers shared by the toolbar menu and the Library page.
export const store = chrome.storage.local;
export const VIEWER = chrome.runtime.getURL("viewer.html");
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const dayKey = (d = new Date()) => "day:" + d.toLocaleDateString("en-CA");
export function fmtTime(ms) {
  const m = Math.floor((ms || 0) / 60000);
  if (m < 1) return "under 1 min";
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function ago(t) {
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
export async function docs() {
  return docsFrom(await store.get(null));
}
export function docsFrom(all) {
  return Object.entries(all).filter(([k]) => k.startsWith("doc:")).map(([k, v]) => ({
    key: k, ...v, highlights: all["ann:" + k.slice(4)]?.items?.length || 0, hasNote: !!all["ann:" + k.slice(4)]?.note
  })).sort((a, b) => (b.t || 0) - (a.t || 0));
}
export function openDoc(d, newTab = true) {
  const url = VIEWER + (d.url ? "?file=" + d.url : "");
  return newTab ? chrome.tabs.create({ url }) : chrome.tabs.update({ url });
}
