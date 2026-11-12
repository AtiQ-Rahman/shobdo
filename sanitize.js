// Cleans HTML taken from a webpage so it is safe to show inside the extension (saved pages, reader.html).
// Only a fixed list of text tags and attributes survives; scripts, styles, forms, frames, event handlers
// and javascript: links are removed. Relative links and image sources are made absolute against `base`.
// Used both when a page is saved (extract.js) and again whenever it is shown (reader.js).
(() => {
  if (window.BPDSanitize) return;
  const HTML_NS = "http://www.w3.org/1999/xhtml";
  // Removed together with everything inside them.
  const DROP = new Set(("script style iframe frame frameset object embed applet svg math form input button select option " +
    "textarea noscript template link meta base canvas video audio source track dialog head title portal").split(" "));
  // Kept, with only these attributes. Any other tag is unwrapped: its text stays, the tag goes.
  const KEEP = {
    p: [], br: [], hr: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], div: [], span: [], section: [], article: [],
    ul: [], ol: ["start", "type", "reversed"], li: [], dl: [], dt: [], dd: [], blockquote: [], pre: [], code: [], kbd: [], samp: [],
    em: [], strong: [], b: [], i: [], u: [], s: [], del: [], ins: [], sub: [], sup: [], small: [], abbr: ["title"], q: [], cite: [],
    time: [], figure: [], figcaption: [], a: ["href", "title"], img: ["src", "alt", "title"],
    table: [], caption: [], thead: [], tbody: [], tfoot: [], tr: [], th: ["colspan", "rowspan", "scope"], td: ["colspan", "rowspan"]
  };

  function safeUrl(v, base, schemes) {
    if (!v) return "";
    try {
      const u = new URL(v.trim(), base);
      return schemes.includes(u.protocol) ? u.href : "";
    } catch { return ""; }
  }

  function walk(el, base) {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) continue;
      if (n.nodeType !== 1 || n.namespaceURI !== HTML_NS || DROP.has(n.localName)) { n.remove(); continue; }
      walk(n, base);
      const allowed = KEEP[n.localName];
      if (!allowed) { n.replaceWith(...n.childNodes); continue; }
      for (const a of [...n.attributes]) if (!allowed.includes(a.name)) n.removeAttribute(a.name);
      if (n.localName === "a") {
        const href = safeUrl(n.getAttribute("href"), base, ["http:", "https:", "mailto:"]);
        if (href) { n.setAttribute("href", href); n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener noreferrer"); }
        else n.removeAttribute("href");
      }
      if (n.localName === "img") {
        const src = safeUrl(n.getAttribute("src"), base, ["http:", "https:"]);
        if (!src) { n.remove(); continue; }
        n.setAttribute("src", src);
        n.setAttribute("loading", "lazy");
        n.setAttribute("referrerpolicy", "no-referrer");
      }
      if ((n.localName === "td" || n.localName === "th") && n.getAttribute("colspan") && !/^\d{1,3}$/.test(n.getAttribute("colspan"))) n.removeAttribute("colspan");
    }
  }

  // Returns clean HTML as a string. DOMParser documents are inert: nothing in them runs or loads.
  window.BPDSanitize = (html, base) => {
    const doc = new DOMParser().parseFromString("<!doctype html><body>" + String(html || ""), "text/html");
    walk(doc.body, base || "about:blank");
    return doc.body.innerHTML;
  };
})();
