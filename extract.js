// Injected into a tab (after lib/Readability.js and sanitize.js) when you save a page.
// Defines window.__shobdoExtract(mode), which returns the page's main text as clean HTML:
//   mode "page":      the article, found by Readability (the same code as Firefox's Reader View)
//   mode "selection": only the text you selected
(() => {
  const MAX = 3_000_000; // characters of HTML; a long book chapter is well under 1 MB

  function selectionHtml() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed) return "";
    const div = document.createElement("div");
    for (let i = 0; i < sel.rangeCount; i++) div.append(sel.getRangeAt(i).cloneContents());
    return div.innerHTML;
  }

  window.__shobdoExtract = (mode) => {
    const url = location.href;
    const out = { url, title: document.title || url, byline: "", site: location.hostname.replace(/^www\./, ""), excerpt: "", html: "" };
    if (mode === "selection") {
      out.html = selectionHtml();
      if (!out.html) return { error: "Select the text you want to save first." };
      out.title = (document.title || out.site) + " (selection)";
    } else {
      let art = null;
      try { art = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse(); } catch {}
      if (!art || (art.length || 0) < 200) {
        return { error: "Couldn't find the main text on this page. Select the part you want, then right-click → “Save selected text to Shobdo”." };
      }
      Object.assign(out, {
        html: art.content, title: (art.title || document.title || url).trim(), byline: (art.byline || "").trim(),
        site: (art.siteName || out.site).trim(), excerpt: (art.excerpt || "").trim().slice(0, 300)
      });
    }
    out.html = window.BPDSanitize(out.html, document.baseURI);
    if (out.html.length > MAX) return { error: "This page is too long to save." };
    // An inert document, so the images in it don't start loading; used only to count the text.
    out.chars = new DOMParser().parseFromString(out.html, "text/html").body.textContent.replace(/\s+/g, " ").trim().length;
    if (!out.chars) return { error: "There's no text to save here." };
    return out;
  };
})();
