// Double-click a word → meaning (with its sentence). Drag-select a phrase/sentence → "অনুবাদ" pill → translation.
(() => {
  if (window.__bpdContent) return;
  window.__bpdContent = true;
  const B = () => window.BPD;

  const clean = (s) => s.replace(/\s+/g, " ").trim();
  const trimPunct = (s) => s.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, "");
  const hasWord = (s) => /[A-Za-z\u0980-\u09FF]/.test(s);
  const editable = (el) => el && el.closest && el.closest("input, textarea, [contenteditable=''], [contenteditable='true']");

  // Text of the enclosing block (a pdf.js page or a paragraph), with <br>/line ends turned into spaces.
  function blockOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el.closest(".textLayer") || el.closest("p, li, td, th, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6, div") || el;
  }

  function sentenceAround(range, word) {
    const root = blockOf(range.startContainer);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let text = "", start = -1;
    for (let n = tw.currentNode; n && text.length < 50000; n = tw.nextNode()) {
      if (n.nodeType === 1) { if (n.tagName === "BR") text += " "; continue; }
      if (n === range.startContainer) start = text.length + range.startOffset;
      text += n.data;
    }
    if (start < 0) start = text.indexOf(word);
    if (start < 0) return null;
    // move start onto the trimmed word
    const at = text.indexOf(word, Math.max(0, start - 2));
    if (at >= 0 && at - start < 4) start = at;
    const end = start + word.length;
    const m = text.slice(0, start).match(/^[\s\S]*[.!?।]["')\]]?\s/);
    let s = m ? m[0].length : 0;
    const r = text.slice(end).search(/[.!?।](?=["')\]]?(\s|$))/);
    let e = r < 0 ? text.length : end + r + 1;
    // keep it readable: at most ~300 chars around the word
    if (start - s > 150) s = text.lastIndexOf(" ", start - 150) + 1;
    if (e - end > 150) { const sp = text.indexOf(" ", end + 150); e = sp < 0 ? text.length : sp; }
    const sentence = clean(text.slice(s, e));
    // whitespace was collapsed, so pick the occurrence of the word closest to where it was
    const rel = start - s;
    let best = -1;
    for (let i = sentence.indexOf(word); i >= 0; i = sentence.indexOf(word, i + 1)) {
      if (best < 0 || Math.abs(i - rel) < Math.abs(best - rel)) best = i;
    }
    if (best < 0) return null;
    return { text: sentence, start: best, end: best + word.length };
  }

  let lastDbl = 0;
  document.addEventListener("dblclick", (e) => {
    lastDbl = Date.now();
    if (B().contains(e.target) || editable(e.target)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = trimPunct(clean(sel.toString()));
    if (!text || !hasWord(text)) return;
    const range = sel.getRangeAt(0);
    if (/\s/.test(text)) { B().showPassage(text.slice(0, 1500), range.getBoundingClientRect()); return; }
    let sentence = null;
    try { sentence = sentenceAround(range, text); } catch {}
    // The PDF reader sets window.BPD_CTX = { title, url, docKey } so saved words remember their PDF.
    const extras = window.BPD_SELECTION_EXTRAS ? window.BPD_SELECTION_EXTRAS(range) : [];
    B().show(text, range.getBoundingClientRect(), sentence, { ...(window.BPD_CTX || {}), extras });
  });

  // Drag-select / triple-click: offer translation of the selected phrase or passage.
  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0 || B().contains(e.target) || editable(e.target) || e.detail === 2) return;
    setTimeout(() => {
      if (Date.now() - lastDbl < 500) return; // a double-click opens the meaning box instead
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = clean(sel.toString());
      const range = sel.getRangeAt(0);
      // The PDF reader can add highlight/note buttons for this selection.
      const extras = window.BPD_SELECTION_EXTRAS ? window.BPD_SELECTION_EXTRAS(range) : [];
      if (!hasWord(text) || text.length > 1500) return;
      if (!/\s/.test(text) && !extras.length) return;
      const rects = range.getClientRects();
      const last = rects[rects.length - 1] || range.getBoundingClientRect();
      B().showBar(text, last, extras);
    }, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (B().contains(e.target)) return;
    B().hide();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") B().hide(); });
  window.addEventListener("scroll", () => B().hide(), true);
})();
