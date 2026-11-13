// Download a word list as .txt, .md or PDF (PDF through the print window, so Bangla text renders properly).
// Each word: Bangla meaning, English definition, the sentence it's in, a short info line (pages, source…).
// At the end, the same words shuffled, for active recall: say each meaning, then check it by its number.
// items: [{ word, bn, en, sentence, meta }] in the order to number them.

const escapeHtml = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RECALL_HINT = "Say the meaning of each word, then check it above by its number.";

function shuffled(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

function asText(items, title, sub, md) {
  const L = [];
  if (md) {
    L.push(`# ${title}`, "", sub, "");
    for (const x of items) {
      L.push(`## ${x.n}. ${x.word}`, "");
      if (x.bn) L.push(`- **বাংলা:** ${x.bn}`);
      if (x.en) L.push(`- **English:** ${x.en}`);
      if (x.meta) L.push(`- ${x.meta}`);
      if (x.sentence) L.push("", `> ${x.sentence}`);
      L.push("");
    }
    L.push("---", "", "## Active recall", "", RECALL_HINT, "");
    for (const x of shuffled(items)) L.push(`- [ ] ${x.word} (#${x.n})`);
  } else {
    L.push(title, sub, "");
    for (const x of items) {
      L.push(`${x.n}. ${x.word}`);
      if (x.bn) L.push(`   Bangla:  ${x.bn}`);
      if (x.en) L.push(`   English: ${x.en}`);
      if (x.sentence) L.push(`   “${x.sentence}”`);
      if (x.meta) L.push(`   ${x.meta}`);
      L.push("");
    }
    L.push("------------------------------", "ACTIVE RECALL", RECALL_HINT, "");
    for (const x of shuffled(items)) L.push(`[ ] ${x.word} (#${x.n})`);
  }
  return L.join("\n") + "\n";
}

function asHtml(items, title, sub) {
  const e = escapeHtml;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title><style>
    body { font: 11pt/1.45 Georgia, "Times New Roman", serif; color: #111; margin: 0; }
    h1 { font: 700 18pt system-ui, sans-serif; margin: 0 0 2pt; } .sub { color: #555; margin: 0 0 14pt; font-size: 10pt; }
    .w { break-inside: avoid; padding: 7pt 0; border-bottom: 1px solid #ddd; }
    .w h2 { font: 700 13pt system-ui, sans-serif; margin: 0 0 2pt; } .w h2 small { font-weight: 400; color: #666; font-size: 9pt; margin-left: 6pt; }
    .bn { font-family: "Noto Serif Bengali", "Noto Sans Bengali", "Nirmala UI", Vrinda, serif; color: #00573f; }
    .s { margin: 3pt 0 0; padding-left: 8pt; border-left: 3px solid #bcd; color: #333; font-style: italic; }
    .recall { break-before: page; } .recall ol { columns: 3; padding-left: 0; list-style: none; } .recall li { padding: 3pt 0; break-inside: avoid; }
    .recall li::before { content: "☐ "; } .recall small { color: #888; }
  </style></head><body>
  <h1>${e(title)}</h1><p class="sub">${e(sub)}</p>
  ${items.map((x) => `<div class="w"><h2>${x.n}. ${e(x.word)}${x.meta ? `<small>${e(x.meta)}</small>` : ""}</h2>
    ${x.bn ? `<div class="bn">${e(x.bn)}</div>` : ""}${x.en ? `<div>${e(x.en)}</div>` : ""}
    ${x.sentence ? `<p class="s">${e(x.sentence)}</p>` : ""}</div>`).join("")}
  <section class="recall"><h1>Active recall</h1><p class="sub">${e(RECALL_HINT)}</p>
  <ol>${shuffled(items).map((x) => `<li>${e(x.word)} <small>#${x.n}</small></li>`).join("")}</ol></section>
  </body></html>`;
}

// Print a page of HTML from a hidden frame; the print window offers "Save as PDF".
export function printHtml(html) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  f.srcdoc = html;
  f.onload = () => { f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
  document.body.append(f);
}

// fmt: "txt" | "md" | "pdf". `order` describes the order, e.g. "in page order"; it goes under the title.
export function downloadWords({ items, title, order, fileName, fmt }) {
  if (!items.length) return;
  items = items.map((x, i) => ({ ...x, n: i + 1 }));
  const sub = `${items.length} word${items.length > 1 ? "s" : ""}, ${order} · ${new Date().toLocaleDateString("en-CA")}`;
  if (fmt === "pdf") return printHtml(asHtml(items, title, sub));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([asText(items, title, sub, fmt === "md")], { type: fmt === "md" ? "text/markdown" : "text/plain" }));
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, " ").trim() + "." + fmt;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
