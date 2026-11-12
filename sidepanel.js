// The side panel shared by the PDF reader and the saved-page reader: Words / Notes tabs, the drag handle on its
// left edge, the A− / A+ text size, and the highlight strength. Width and sizes are remembered for both readers.
const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;
const SIDE_MIN = 260, FS_MIN = 12, FS_MAX = 24;

// onLayout runs after the panel opens, closes or changes width (the PDF reader refits its pages then).
export function initSidePanel({ onLayout = () => {} } = {}) {
  let paneOpen = null;
  let sideW = null, sideFs = 14; // sideW null = default width, which grows with the text size

  function open(pane) {
    const close = !pane || paneOpen === pane;
    paneOpen = close ? null : pane;
    $("side").hidden = close;
    document.body.classList.toggle("side-open", !close);
    $("notesBtn").setAttribute("aria-pressed", String(paneOpen === "notes"));
    $("wordsBtn").setAttribute("aria-pressed", String(paneOpen === "words"));
    for (const t of document.querySelectorAll("#side [role=tab]")) t.setAttribute("aria-selected", String(t.dataset.pane === pane));
    $("paneNotes").hidden = pane !== "notes";
    $("paneWords").hidden = pane !== "words";
    setTimeout(onLayout, 0);
  }

  const sideMax = () => Math.max(SIDE_MIN, Math.round(innerWidth * 0.7));
  function apply() {
    if (sideW != null) sideW = Math.min(Math.max(SIDE_MIN, Math.round(sideW)), sideMax());
    document.documentElement.style.setProperty("--side-w", sideW != null ? sideW + "px" : "20rem");
    document.documentElement.style.setProperty("--side-scale", sideFs / 14); // 14 = same as the rest of the app
    $("fontDown").disabled = sideFs <= FS_MIN;
    $("fontUp").disabled = sideFs >= FS_MAX;
    const h = $("sideResize");
    h.setAttribute("aria-valuemin", SIDE_MIN); h.setAttribute("aria-valuemax", sideMax()); h.setAttribute("aria-valuenow", sideW ?? ($("side").offsetWidth || 320));
  }
  function save() { store.set(sideW != null ? { sideW, sideFs } : { sideFs }); }
  function load(r) {
    if ("sideW" in r) sideW = r.sideW || null;
    if ("sideFs" in r) sideFs = r.sideFs || 14;
    if ("hlAlpha" in r) document.documentElement.style.setProperty("--hl-alpha", r.hlAlpha || 0.4);
    apply();
  }
  store.get(["sideW", "sideFs", "hlAlpha"]).then(load);
  // Settings changed in the Library (or another reader tab): apply right away.
  chrome.storage.onChanged.addListener((c) => {
    const r = {};
    for (const k of ["sideW", "sideFs", "hlAlpha"]) if (k in c) r[k] = c[k].newValue;
    if (Object.keys(r).length) { load(r); if ("sideW" in r) onLayout(); }
  });
  apply();

  $("fontDown").onclick = () => { sideFs = Math.max(FS_MIN, sideFs - 1); apply(); save(); };
  $("fontUp").onclick = () => { sideFs = Math.min(FS_MAX, sideFs + 1); apply(); save(); };
  $("sideResize").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    h.classList.add("drag"); document.body.classList.add("resizing");
    const move = (ev) => { sideW = innerWidth - ev.clientX; apply(); };
    const up = () => {
      h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up);
      h.classList.remove("drag"); document.body.classList.remove("resizing");
      save(); onLayout();
    };
    h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
  });
  $("sideResize").addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    sideW = (sideW ?? $("side").offsetWidth) + (e.key === "ArrowLeft" ? step : -step);
    e.preventDefault(); apply(); save(); onLayout();
  });
  addEventListener("resize", apply);

  $("notesBtn").onclick = () => open("notes");
  $("wordsBtn").onclick = () => open("words");
  for (const t of document.querySelectorAll("#side [role=tab]")) t.onclick = () => open(t.dataset.pane);
  document.querySelector("#side .close").onclick = () => open(null);
  return { open };
}
