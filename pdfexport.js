// Write our highlights + notes into a copy of the PDF as standard annotations,
// so Adobe Reader, Chrome, Edge, Preview etc. show them.
// Needs lib/pdf-lib.min.js loaded (window.PDFLib).

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const n = (x) => +x.toFixed(3);

export async function buildAnnotatedPdf(originalBytes, pdfjsDoc, data, author = "Shobdo") {
  const { PDFDocument, PDFName, PDFString, PDFHexString } = window.PDFLib;
  let pdf;
  try {
    pdf = await PDFDocument.load(originalBytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error("this PDF is password-protected or locked against editing, so highlights can't be written into it");
    throw e;
  }
  const ctx = pdf.context;
  const pages = pdf.getPages();
  const now = PDFString.fromDate(new Date());

  for (const it of data.items) {
    const page = pages[it.page - 1];
    if (!page) continue;
    // Our rects are fractions of the rendered page; pdf.js converts them back to PDF points
    // (handles rotation and crop-box offsets).
    const view = (await pdfjsDoc.getPage(it.page)).getViewport({ scale: 1 });
    const quads = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [l, t, w, h] of it.rects) {
      const pts = [[l, t], [l + w, t], [l, t + h], [l + w, t + h]].map(([fx, fy]) => view.convertToPdfPoint(fx * view.width, fy * view.height));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
      quads.push([x1, y2, x2, y2, x1, y1, x2, y1].map(n)); // TL, TR, BL, BR — the order Acrobat expects
      minX = Math.min(minX, x1); minY = Math.min(minY, y1); maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2);
    }
    const rect = [minX, minY, maxX, maxY].map(n);
    const [r, g, b] = hexToRgb(it.color);

    // Appearance stream: viewers that don't draw highlights themselves (Chrome, Preview) use this.
    const ops = `/GS0 gs ${n(r)} ${n(g)} ${n(b)} rg\n` + quads.map((q) => `${q[4]} ${q[5]} ${n(q[2] - q[0])} ${n(q[1] - q[5])} re f`).join("\n");
    const ap = ctx.register(ctx.stream(ops, {
      Type: "XObject", Subtype: "Form", BBox: rect,
      Resources: { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply", CA: 1, ca: 1 } } }
    }));

    const annot = ctx.obj({
      Type: "Annot", Subtype: "Highlight", Rect: rect, QuadPoints: quads.flat(),
      C: [n(r), n(g), n(b)], CA: 1, F: 4, AP: { N: ap }
    });
    annot.set(PDFName.of("T"), PDFHexString.fromText(author));
    annot.set(PDFName.of("M"), now);
    annot.set(PDFName.of("NM"), PDFString.of("bpd-" + it.id));
    if (it.note) annot.set(PDFName.of("Contents"), PDFHexString.fromText(it.note));
    page.node.addAnnot(ctx.register(annot));
  }

  // The note about the whole PDF becomes a sticky note at the top-left of page 1.
  if (data.note && pages[0]) {
    const { width, height } = pages[0].getSize();
    const sticky = ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [18, height - 42, 42, height - 18], Name: "Comment", C: [1, 0.83, 0], F: 4, Open: false });
    sticky.set(PDFName.of("Contents"), PDFHexString.fromText(data.note));
    sticky.set(PDFName.of("T"), PDFHexString.fromText(author));
    sticky.set(PDFName.of("M"), now);
    pages[0].node.addAnnot(ctx.register(sticky));
    void width;
  }
  return pdf.save();
}
