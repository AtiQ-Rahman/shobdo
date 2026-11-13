// Meaning bubble + selection bar, rendered in a closed shadow root so page CSS can't touch it.
(() => {
  if (window.BPD) return;
  let host, root, box, bar;
  let barData = null;

  const BN = `"Noto Serif Bengali", "Noto Sans Bengali", "Hind Siliguri", "Nirmala UI", Vrinda, serif`;
  const CSS = `
  :host { all: initial; }
  .box, .bar {
    --surface: #ffffff; --ink: #1c2421; --muted: #5e6b66; --rule: #e3e8e6;
    --green: #006a4e; --tint: #e7f2ee; --mark: #fff1b8; --on-green: #ffffff;
    position: fixed; z-index: 2147483647; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink);
  }
  @media (prefers-color-scheme: dark) {
    .box, .bar { --surface: #18201d; --ink: #e6ece9; --muted: #9aa8a2; --rule: #2c3833;
      --green: #4fc69a; --tint: #1f3029; --mark: #5a4a12; --on-green: #0f1a16; }
  }
  .box { width: 24.3em; max-width: calc(100vw - 16px); max-height: min(32.9em, calc(100vh - 16px)); overflow: auto;
    background: var(--surface); border: 1px solid var(--rule); border-left: 4px solid var(--green);
    border-radius: 4px 10px 10px 4px; box-shadow: 0 10px 30px rgba(10, 40, 30, .18);
    scrollbar-width: thin; scrollbar-color: var(--rule) transparent; }
  .box.in { animation: pop .12s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .box.in { animation: none; } }

  .top { padding: 12px 14px 10px; }
  .head { display: flex; align-items: center; gap: 6px; }
  .word { font-weight: 600; font-size: 1.071em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
  .ph { color: var(--muted); font-size: 0.929em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 1 0; }
  .tools { margin-left: auto; display: flex; gap: 0; flex: none; }
  .head .ib { width: 26px; }
  .head .back { flex: none; margin-left: -6px; }
  .ib { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 6px; color: var(--muted); }
  .ib:hover { background: var(--tint); color: var(--ink); }
  .ib.on { color: var(--green); }
  .ib.on svg { fill: currentColor; }
  .ib:focus-visible, .btn:focus-visible, .bar button:focus-visible { outline: 2px solid var(--green); outline-offset: 1px; }
  .ib svg { width: 16px; height: 16px; }

  .bn { font-family: ${BN}; font-size: 2em; line-height: 1.3; font-weight: 600; color: var(--green); margin: 4px 0 2px; }
  .en-hero { font-family: Georgia, "Times New Roman", serif; }
  .bn.passage { font-size: 1.286em; line-height: 1.6; font-weight: 500; color: var(--ink); }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; color: var(--muted); font-size: 0.857em; }
  .lvl { display: inline-flex; align-items: center; gap: 6px; }
  .lvl i { display: inline-flex; gap: 2px; }
  .lvl i b { width: 4px; height: 10px; border-radius: 1px; background: var(--rule); }
  .lvl i b.f { background: var(--green); }
  .ipa { color: var(--ink); overflow-wrap: anywhere; }
  .basef b { color: var(--ink); font-weight: 600; }
  .basef span { font-family: ${BN}; }
  .alts { margin: 8px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; }
  .pos { font-style: italic; color: var(--muted); font-family: Georgia, serif; }
  .terms { font-family: ${BN}; font-size: 1.071em; }
  .terms.en { font-family: Georgia, serif; }
  .forms { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; }
  .fw { all: unset; cursor: pointer; font-weight: 600; color: var(--green); border-bottom: 1px dotted currentColor; }
  .fw:hover { border-bottom-style: solid; }
  .fw:focus-visible { outline: 2px solid var(--green); outline-offset: 1px; }
  .fbn { font-family: ${BN}; }

  .sec { border-top: 1px solid var(--rule); padding: 10px 14px 12px; }
  .label { font-size: 0.857em; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
  ol { margin: 0; padding-left: 20px; }
  li { margin: 2px 0; }
  li .pos { margin-right: 4px; }
  .ex { color: var(--muted); }
  .syn { margin-top: 6px; color: var(--muted); font-size: 0.929em; }
  .syn b { font-weight: 600; color: var(--ink); }

  .orig { color: var(--muted); font-size: 0.929em; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .sent { font-family: Georgia, "Times New Roman", serif; font-size: 1em; line-height: 1.55; }
  mark { background: var(--mark); color: inherit; border-radius: 2px; padding: 0 1px; }
  .btn { all: unset; cursor: pointer; margin-top: 8px; font-size: 0.929em; font-weight: 600; color: var(--green);
    padding: 5px 10px; border: 1px solid currentColor; border-radius: 999px; }
  .btn:hover { background: var(--tint); }
  .sbn { font-family: ${BN}; font-size: 1.143em; line-height: 1.65; margin-top: 8px; padding: 8px 10px; background: var(--tint); border-radius: 6px; }
  .muted { color: var(--muted); }
  .hlrow { display: flex; align-items: center; gap: 4px; padding-top: 8px; padding-bottom: 8px; }
  .hlrow .label { margin: 0 6px 0 0; }
  .hlrow button { all: unset; cursor: pointer; height: 26px; min-width: 26px; display: grid; place-items: center; border-radius: 999px; font-size: 0.929em; font-weight: 600; }
  .hlrow button:hover { background: var(--tint); }
  .hlrow button:focus-visible { outline: 2px solid var(--green); }
  .hlrow .dot i { width: 16px; height: 16px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
  .hlrow .note { padding: 0 8px; }
  .foot { border-top: 1px solid var(--rule); padding: 7px 14px; font-size: 0.857em; color: var(--muted); display: flex; gap: 6px; align-items: center; }
  .foot svg { width: 13px; height: 13px; flex: none; }

  .bar { display: flex; align-items: center; gap: 2px; padding: 3px; background: var(--surface); border: 1px solid var(--rule);
    border-radius: 999px; box-shadow: 0 4px 16px rgba(0, 40, 28, .22); }
  .bar button { all: unset; cursor: pointer; height: 28px; display: grid; place-items: center; border-radius: 999px; font-size: 0.929em; font-weight: 600; }
  .bar .tr { padding: 0 12px; background: var(--green); color: var(--on-green); }
  .bar .dot { width: 28px; }
  .bar .dot i { width: 16px; height: 16px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
  .bar .dot:hover, .bar .note:hover { background: var(--tint); }
  .bar .note { padding: 0 10px; color: var(--ink); }
  .bar .sep { width: 1px; height: 18px; background: var(--rule); margin: 0 3px; }
  [hidden] { display: none !important; }`;

  const ICON = {
    speak: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
    save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
  };
  const TITLES = { speak: "Pronounce", save: "Save to My words", copy: "Copy English word", search: "Search on Google", close: "Close" };
  const POS = { noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv.", pronoun: "pron.", preposition: "prep.",
    conjunction: "conj.", interjection: "interj.", abbreviation: "abbr.", article: "art.", exclamation: "excl.", other: "also" };
  const pos = (p) => POS[String(p || "").toLowerCase()] || p || "";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
  const isBn = (t) => /[ঀ-৿]/.test(t);
  const today = () => "day:" + new Date().toLocaleDateString("en-CA");
  const fmtMin = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement("bpd-bubble");
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><div class="box" role="dialog" aria-label="Meaning" hidden></div><div class="bar" hidden></div>`;
    box = root.querySelector(".box");
    bar = root.querySelector(".bar");
    box.addEventListener("click", onBoxClick);
    box.addEventListener("dblclick", onBoxDblClick);
    bar.addEventListener("mousedown", (e) => e.preventDefault()); // keep the page selection
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !barData) return;
      const d = barData;
      hideBar();
      if (b.dataset.i === "tr") showPassage(d.text, d.rect);
      else d.extras[+b.dataset.i].onClick();
    });
    document.documentElement.appendChild(host);
  }

  // ---------- state for the open bubble ----------
  let cur = null; // { text, sentence, ctx, off, on, saved }
  let back = [];  // words you looked up before this one from inside the box (newest last)
  let lastRect = null;

  function speak(text, audio) {
    if (text) send({ type: "speak", text, audio });
  }

  function hero(m) {
    if (m.mode === "passage") return m.on?.tr?.translation || "";
    if (isBn(m.text)) return m.on?.tr?.translation || m.off?.en?.[0] || "";
    return m.on?.tr?.translation || m.off?.bn?.[0] || "";
  }

  async function onBoxClick(e) {
    const b = e.target.closest("button");
    if (!b || !cur) return;
    const act = b.dataset.act;
    if (act === "close") hide();
    if (act === "form") lookInside(b.dataset.w);
    if (act === "back") { const m = back.pop(); if (m) { cur = m; seq++; box.scrollTop = 0; paint(lastRect); } }
    if (act === "search") {
      const q = cur.mode === "passage" ? cur.text.slice(0, 300) : cur.text + " meaning";
      window.open("https://www.google.com/search?q=" + encodeURIComponent(q), "_blank", "noopener");
    }
    if (act === "speak") speak(isBn(cur.text) ? hero(cur) : cur.text, cur.on?.pron?.audio);
    if (act === "copy") navigator.clipboard.writeText(isBn(cur.text) ? hero(cur) : cur.text).then(() => { b.title = "Copied"; }, () => {});
    if (act === "save") toggleSave(b);
    if (act === "extra") { const x = cur.ctx.extras[+b.dataset.i]; hide(); x.onClick(); }
    if (act === "sentence") {
      const out = box.querySelector(".sbn");
      b.hidden = true; out.hidden = false; out.textContent = "Translating…";
      const r = await send({ type: "online", text: cur.sentence.text });
      out.textContent = r?.tr?.translation || "Couldn't translate this sentence. Check your internet connection and try again.";
    }
  }

  // Double-click a word inside the box (a meaning, a definition, the sentence…) to look it up there.
  function onBoxDblClick(e) {
    if (!cur || e.target.closest("button")) return;
    const sel = root.getSelection ? root.getSelection() : window.getSelection();
    const text = (sel?.toString() || "").replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, "");
    sel?.removeAllRanges();
    if (!/\s/.test(text) && /[A-Za-z\u0980-\u09FF]/.test(text)) lookInside(text);
  }

  function lookInside(text) {
    if (!text || text.toLowerCase() === cur.text.toLowerCase()) return;
    const { extras, ...ctx } = cur.ctx || {}; // highlight buttons belong to the word in the page, not this one
    back.push(cur);
    show(text, lastRect, null, ctx, true);
  }

  async function toggleSave(btn) {
    const m = cur;
    const key = "v:" + (m.off?.lemma || m.text).toLowerCase();
    if (m.saved) {
      await chrome.storage.local.remove(key);
      m.saved = false;
    } else {
      const d = m.off?.defs?.[0];
      await chrome.storage.local.set({ [key]: {
        w: m.text, lemma: m.off?.lemma || m.text.toLowerCase(), meaning: hero(m),
        more: (m.off?.bn || m.off?.en || []).slice(0, 5), def: d ? d[1] : "", pos: d ? d[0] : "",
        sentence: m.sentence?.text || "", src: { title: m.ctx?.title || document.title, url: m.ctx?.url || location.href, ...(m.ctx?.docKey ? { doc: m.ctx.docKey } : {}) },
        t: Date.now()
      } });
      m.saved = true;
    }
    btn.classList.toggle("on", m.saved);
    btn.title = m.saved ? "Saved — click to remove" : TITLES.save;
  }

  function place(rect) {
    const W = box.offsetWidth || 340, gap = 10, pad = 8;
    box.style.left = Math.min(Math.max(pad, rect.left), window.innerWidth - W - pad) + "px";
    box.style.maxHeight = "";
    const h = box.offsetHeight;
    const below = window.innerHeight - rect.bottom - gap - pad, above = rect.top - gap - pad;
    const down = h <= below || (h > above && below >= above);
    const room = down ? below : above;
    if (h > room) box.style.maxHeight = Math.max(120, room) + "px";
    box.style.top = (down ? rect.bottom + gap : rect.top - gap - Math.min(h, Math.max(120, room))) + "px";
  }

  // ---------- rendering ----------
  function head(word, phonetic, tools, saved) {
    const b = back.length ? `<button class="ib back" data-act="back" title="Back to “${esc(back[back.length - 1].mode === "passage" ? "Translation" : back[back.length - 1].text)}”">${ICON.back}</button>` : "";
    return `<div class="head">${b}<span class="word" title="${esc(word)}">${esc(word)}</span><span class="ph">${esc(phonetic || "")}</span>
      <span class="tools">${tools.map((t) => `<button class="ib${t === "save" && saved ? " on" : ""}" data-act="${t}" title="${saved && t === "save" ? "Saved — click to remove" : TITLES[t]}">${ICON[t]}</button>`).join("")}</span></div>`;
  }

  function sentenceBlock(s) {
    if (!s || !s.text || s.text.split(" ").length < 3) return "";
    const a = s.text.slice(0, s.start), w = s.text.slice(s.start, s.end), z = s.text.slice(s.end);
    return `<div class="sec"><div class="label">In this sentence</div>
      <div class="sent">${esc(a)}<mark>${esc(w)}</mark>${esc(z)}</div>
      <button class="btn" data-act="sentence">Translate sentence</button>
      <div class="sbn" hidden></div></div>`;
  }

  // In the PDF reader: highlight the double-clicked word straight from the box.
  function hlRow(m) {
    const ex = m.ctx?.extras;
    if (!ex?.length) return "";
    return `<div class="sec hlrow"><span class="label">Highlight</span>` +
      ex.map((x, i) => `<button class="${x.cls || ""}" data-act="extra" data-i="${i}" title="${esc(x.title)}">${x.html}</button>`).join("") + `</div>`;
  }

  function foot(m) {
    if (!m.stats) return "";
    const parts = [];
    if (m.stats.ms >= 60000) parts.push(`Today: ${fmtMin(m.stats.ms)} reading`);
    if (m.stats.doc >= 60000) parts.push(`${fmtMin(m.stats.doc)} on this PDF`);
    parts.push(`${m.stats.n} word${m.stats.n === 1 ? "" : "s"} looked up today`);
    return `<div class="foot">${ICON.clock}<span>${parts.map(esc).join(" · ")}</span></div>`;
  }

  // Other parts of speech of the same word: n. decision সিদ্ধান্ত · adj. decisive …  (click one to look it up)
  function formsSection(forms) {
    if (!forms?.length) return "";
    const rows = [];
    for (const f of forms) {
      const last = rows[rows.length - 1];
      if (last && last[0] === f.pos) last[1].push(f); else rows.push([f.pos, [f]]);
    }
    return `<div class="sec"><div class="label">Word family</div><div class="forms">` + rows.map(([p, fs]) =>
      `<span class="pos">${esc(pos(p))}</span><span>` + fs.map((f) =>
        `<button class="fw" data-act="form" data-w="${esc(f.word)}" title="Look up “${esc(f.word)}”">${esc(f.word)}</button>${f.bn ? ` <span class="fbn">${esc(f.bn)}</span>` : ""}`).join(", ") +
      `</span>`).join("") + `</div></div>`;
  }

  function englishSection(defs, syn, ant) {
    if (!defs?.length) return "";
    let h = `<div class="sec"><div class="label">English</div><ol>` +
      defs.slice(0, 4).map(([p, d, ex]) => `<li><span class="pos">${esc(pos(p))}</span>${esc(d)}${ex ? ` <span class="ex">“${esc(ex)}”</span>` : ""}</li>`).join("") + `</ol>`;
    if (syn?.length) h += `<div class="syn"><b>Similar:</b> ${syn.slice(0, 6).map(esc).join(", ")}</div>`;
    if (ant?.length) h += `<div class="syn"><b>Opposite:</b> ${ant.slice(0, 4).map(esc).join(", ")}</div>`;
    return h + `</div>`;
  }

  function renderWord(m) {
    const bnWord = isBn(m.text);
    let h = `<div class="top">` + head(m.text, "", ["speak", "save", "copy", "search", "close"], m.saved);
    const main = hero(m);
    if (!main) {
      if (m.pending) return h + `<div class="bn muted" style="font-size:18px">Looking up…</div></div>`;
      return h + `<p class="muted">No meaning found${m.on?.error ? " and the online dictionary couldn't be reached" : ""}. Check the spelling, or your internet connection.</p></div>` + sentenceBlock(m.sentence) + hlRow(m) + foot(m);
    }
    h += `<div class="bn${bnWord ? " en-hero" : ""}">${esc(main)}</div>`;
    const meta = [];
    if (m.on?.pron?.phonetic) meta.push(`<span class="ipa">${esc(m.on.pron.phonetic)}</span>`); // its own line part, so it never gets cut
    if (m.on?.tr?.translit && !bnWord) meta.push(`<span>${esc(m.on.tr.translit)}</span>`);
    if (m.off?.level) meta.push(`<span class="lvl" title="How common this word is in everyday English"><i>${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= m.off.level.n ? "f" : ""}"></b>`).join("")}</i>${esc(m.off.level.label)}</span>`);
    if (m.off?.base) meta.push(`<span class="basef">Base form: <b>${esc(m.off.base.word)}</b>${m.off.base.bn ? ` <span>${esc(m.off.base.bn)}</span>` : ""}</span>`);
    if (meta.length) h += `<div class="meta">${meta.join("")}</div>`;

    // Alternatives: online dictionary groups by part of speech, then offline terms not shown yet.
    const shown = new Set([main]);
    const rows = [];
    for (const d of m.on?.tr?.dict || []) {
      const t = d.terms.filter((x) => !shown.has(x)); t.forEach((x) => shown.add(x));
      if (t.length) rows.push([pos(d.pos), t]);
    }
    const offTerms = (bnWord ? m.off?.en : m.off?.bn) || [];
    const rest = offTerms.filter((x) => !shown.has(x)).slice(0, 8);
    if (rest.length) rows.push([rows.length ? "also" : "", rest]);
    if (rows.length) h += `<div class="alts">` + rows.map(([p, t]) => `<span class="pos">${esc(p)}</span><span class="terms${bnWord ? " en" : ""}">${t.map(esc).join(", ")}</span>`).join("") + `</div>`;
    h += `</div>`;
    h += hlRow(m);
    h += formsSection(m.off?.forms);
    h += englishSection(m.off?.defs, m.off?.syn, m.off?.ant);
    return h + sentenceBlock(m.sentence) + foot(m);
  }

  function renderPassage(m) {
    let h = `<div class="top">` + head("Translation", "", ["copy", "search", "close"]) + `<div class="orig">${esc(m.text)}</div>`;
    const t = hero(m);
    if (!t && m.pending) return h + `<div class="bn passage muted">Translating…</div></div>`;
    if (!t) return h + `<p class="muted">Couldn't translate this text${m.on?.error ? ` (${esc(m.on.error)})` : ""}. Translating passages needs an internet connection.</p></div>`;
    return h + `<div class="bn passage${isBn(m.text) ? " en-hero" : ""}">${esc(t)}</div></div>`;
  }

  // ---------- open / update ----------
  let seq = 0;
  function paint(rect) {
    lastRect = rect;
    box.innerHTML = cur.mode === "passage" ? renderPassage(cur) : renderWord(cur);
    place(rect);
  }

  function openBox(m, rect) {
    ensure(); hideBar();
    cur = m;
    const my = ++seq;
    box.hidden = false;
    box.classList.remove("in"); void box.offsetWidth; box.classList.add("in");
    box.scrollTop = 0;
    paint(rect);
    return () => my === seq && !box.hidden;
  }

  async function show(text, rect, sentence, ctx, inside = false) {
    if (!inside) back = [];
    const m = { mode: "word", text, sentence, ctx, pending: true };
    const alive = openBox(m, rect);
    const key = "v:";
    const onP = send({ type: "online", text });
    m.off = await send({ type: "offline", text, record: true });
    const [saved, st] = await Promise.all([
      chrome.storage.local.get(key + (m.off?.lemma || text).toLowerCase()),
      chrome.storage.local.get([today(), ctx?.docKey].filter(Boolean))
    ]);
    m.saved = !!Object.keys(saved).length;
    m.stats = { ms: st[today()]?.ms || 0, n: st[today()]?.n || 0, doc: ctx?.docKey ? st[ctx.docKey]?.ms || 0 : 0 };
    if (!alive()) return;
    if (hero(m)) paint(rect);
    m.on = await onP;
    m.pending = false;
    if (alive()) paint(rect);
    // Lets the PDF reader / website "your words" list add this word right away.
    if (hero(m)) window.dispatchEvent(new CustomEvent("bpd:lookup", { detail: {
      word: m.off?.lemma || text.toLowerCase(), forms: [text.toLowerCase()], meaning: hero(m), def: m.off?.defs?.[0]?.[1] || "" } }));
  }

  async function showPassage(text, rect) {
    back = [];
    const m = { mode: "passage", text, pending: true };
    const alive = openBox(m, rect);
    m.on = await send({ type: "online", text });
    m.pending = false;
    if (alive()) paint(rect);
  }

  // extras: [{ html, title, cls, onClick }] — extra buttons after "Translate" (the PDF reader adds highlight colors + note)
  function showBar(text, rect, extras = []) {
    ensure();
    barData = { text, rect, extras };
    bar.innerHTML = `<button class="tr" data-i="tr" title="Translate the selection">Translate</button>` +
      (extras.length ? `<span class="sep"></span>` : "") +
      extras.map((x, i) => `<button class="${x.cls || ""}" data-i="${i}" title="${esc(x.title)}">${x.html}</button>`).join("");
    bar.hidden = false;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    bar.style.left = Math.min(Math.max(8, rect.right - w), window.innerWidth - w - 8) + "px";
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = rect.top - h - 6;
    bar.style.top = top + "px";
  }
  function hideBar() { if (bar) bar.hidden = true; barData = null; }
  function hide() { if (box) box.hidden = true; hideBar(); seq++; }
  function contains(node) { return host && (node === host || host.contains(node)); }

  window.BPD = { show, showPassage, showBar, hideBar, hide, contains };
})();
