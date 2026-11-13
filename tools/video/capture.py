# Captures real screenshots of the Shobdo extension for the demo video.
import json, os, shutil, sys, time, datetime
from playwright.sync_api import sync_playwright

EXT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
PROFILE = os.path.join(HERE, "profile")
SITE = "http://localhost:8765/"
W, H = 1600, 900
meta = {}

def shot(page, name, **kw):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), **kw)
    print("shot", name, flush=True)

def rect_of(page, text, nth=0, sel="article p, .textLayer"):
    """Bounding rect (CSS px) of the nth occurrence of text in the page."""
    return page.evaluate("""([text, nth, sel]) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let k = 0;
      while (w.nextNode()) {
        const n = w.currentNode, i = n.data.indexOf(text);
        if (i < 0 || !n.parentElement.closest(sel)) continue;
        if (k++ < nth) continue;
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
        const rs = [...r.getClientRects()], b = r.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height, first: rs[0] && { x: rs[0].left, y: rs[0].top, h: rs[0].height },
                 last: rs.length && { x: rs[rs.length - 1].right, y: rs[rs.length - 1].top, h: rs[rs.length - 1].height } };
      }
      return null;
    }""", [text, nth, sel])

def box(page, sel):
    return page.evaluate("s => { const b = document.querySelector(s).getBoundingClientRect(); return {x:b.left,y:b.top,w:b.width,h:b.height}; }", sel)

def center(r): return (r["x"] + r["w"] / 2, r["y"] + r["h"] / 2)

def in_bubble(page, **attrs):
    """Rect (CSS px) of a button inside the meaning box. The box lives in a closed shadow root,
    which only the DevTools protocol can see into."""
    cdp = page.context.new_cdp_session(page)
    root = cdp.send("DOM.getDocument", {"depth": -1, "pierce": True})["root"]
    def walk(n):
        a = n.get("attributes", [])
        a = dict(zip(a[::2], a[1::2]))
        if n.get("nodeName") == "BUTTON" and all(a.get(k) == v for k, v in attrs.items()): return n
        for c in n.get("children", []) + n.get("shadowRoots", []) + ([n["contentDocument"]] if "contentDocument" in n else []):
            f = walk(c)
            if f: return f
    n = walk(root)
    q = cdp.send("DOM.getBoxModel", {"backendNodeId": n["backendNodeId"]})["model"]["border"]
    cdp.detach()
    return {"x": q[0], "y": q[1], "w": q[2] - q[0], "h": q[5] - q[1]}

def side_window(base_png, win_png, out_png, title):
    """Paint the small Google window over the page screenshot, where Shobdo opens it (right side)."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    bg = Image.open(base_png).convert("RGBA"); w = Image.open(win_png).convert("RGBA")
    S = 1.2; bar = int(30 * S); ww, wh = w.size[0], w.size[1] + bar
    x, y = int((W - 480 - 16) * S), int(70 * S)
    sh = Image.new("RGBA", bg.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([x, y + 8, x + ww, y + wh + 8], 12, fill=(0, 0, 0, 110))
    bg = Image.alpha_composite(bg, sh.filter(ImageFilter.GaussianBlur(18)))
    frame = Image.new("RGBA", (ww, wh), (0, 0, 0, 0)); d = ImageDraw.Draw(frame)
    d.rounded_rectangle([0, 0, ww - 1, wh - 1], 10, fill=(222, 225, 230, 255))
    try: font = ImageFont.truetype("DejaVuSans.ttf", int(13 * S))
    except OSError: font = ImageFont.load_default()
    d.text((int(14 * S), bar // 2), title, fill=(60, 64, 67), font=font, anchor="lm")
    frame.paste(w, (0, bar))
    m = Image.new("L", frame.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, ww - 1, wh - 1], 10, fill=255)
    bg.paste(frame, (x, y), m)
    bg.convert("RGB").save(out_png)

def main():
    shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(PROFILE, channel="chromium", headless=True,
            viewport={"width": W, "height": H}, device_scale_factor=1.2, color_scheme="light", locale="en-US",
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        base = f"chrome-extension://{ext_id}/"

        # make a PDF of the article with the browser itself
        pg = ctx.new_page()
        pg.goto(SITE + "article.html")
        pg.pdf(path=os.path.join(HERE, "site", "article.pdf"), format="A4", print_background=True,
               margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"})

        # ---------- 1. a webpage: double-click a word ----------
        pg.goto(SITE + "article.html"); pg.wait_for_timeout(1500)
        shot(pg, "web_plain")
        r = rect_of(pg, "resilient"); meta["web_word"] = r
        pg.mouse.move(*center(r)); pg.mouse.dblclick(*center(r))
        pg.wait_for_timeout(3500)
        shot(pg, "web_popup")

        # ---------- 1b. look up a word from inside the box: its word family ----------
        r = in_bubble(pg, **{"data-act": "form"}); meta["family_word"] = r
        pg.mouse.move(*center(r)); pg.mouse.click(*center(r)); pg.wait_for_timeout(3500)
        shot(pg, "web_inside")
        meta["back_btn"] = in_bubble(pg, **{"data-act": "back"})
        meta["search_btn"] = in_bubble(pg, **{"data-act": "search"})

        # ---------- 2. drag-select a sentence -> Translate ----------
        pg.mouse.click(40, 860); pg.wait_for_timeout(300)
        s = "Slow reading is not a lack of skill."
        r = rect_of(pg, s); meta["web_sent"] = r
        x0, y0 = r["first"]["x"] + 1, r["first"]["y"] + r["first"]["h"] / 2
        x1, y1 = r["last"]["x"] - 1, r["last"]["y"] + r["last"]["h"] / 2
        pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=12); pg.mouse.up()
        pg.wait_for_timeout(600)
        shot(pg, "web_bar")
        # the bar sits under the end of the selection, right-aligned to it; "Translate" is its only button
        bx, by = x1 - 48, r["last"]["y"] + r["last"]["h"] + 6 + 17
        meta["web_bar_btn"] = {"x": bx, "y": by}
        pg.mouse.click(bx, by); pg.wait_for_timeout(3500)
        shot(pg, "web_passage")
        meta["gt_btn"] = r = in_bubble(pg, **{"data-act": "gt"})
        pg.mouse.move(*center(r)); pg.wait_for_timeout(300)
        shot(pg, "web_gt_hover")
        # The button opens a small browser window; headless Chromium can't show one, so load the same address in a page.
        gw = ctx.new_page(); gw.set_viewport_size({"width": 480, "height": 690})
        gw.goto("https://translate.google.com/?sl=en&tl=bn&op=translate&text=" + s.replace(" ", "%20"))
        try: gw.wait_for_load_state("networkidle", timeout=20000)
        except Exception: pass
        gw.wait_for_timeout(3000)
        gw.screenshot(path=os.path.join(SHOTS, "_gt_window.png"))
        side_window(os.path.join(SHOTS, "web_passage.png"), os.path.join(SHOTS, "_gt_window.png"), os.path.join(SHOTS, "web_gt.png"), "Google Translate")
        print("shot web_gt", flush=True)
        gw.close()

        # ---------- seed: saved words, reading time ----------
        lib = ctx.new_page(); lib.goto(base + "library.html"); lib.wait_for_timeout(500)
        now = int(time.time() * 1000)
        words = {
            "resilient": ("resilient", "স্থিতিস্থাপক", ["নমনীয়", "দৃঢ়"], "adjective", "recovering readily from adversity or difficulty", "they are the most resilient, returning to a hard passage until it finally gives way."),
            "intimidate": ("intimidate", "ভয় দেখানো", ["আতঙ্কিত করা"], "verb", "make timid or fearful", "Long books can intimidate even confident readers."),
            "deliberate": ("deliberate", "ইচ্ছাকৃত", ["সুচিন্তিত", "সতর্ক"], "adjective", "carefully thought out in advance", "It is a deliberate choice to notice how a sentence is built."),
            "cumulative": ("cumulative", "ক্রমবর্ধমান", ["পুঞ্জীভূত"], "adjective", "increasing by successive addition", "Comprehension is cumulative."),
            "ritual": ("ritual", "আচার", ["নিয়ম", "রীতি"], "noun", "any customary observance or practice", "once you have a simple ritual."),
            "genuinely": ("genuinely", "প্রকৃতপক্ষে", ["সত্যিকারভাবে"], "adverb", "in accordance with truth or fact", "a vocabulary that feels genuinely yours."),
        }
        seed = {"recall": False}
        for i, (k, (w, m, more, pos, d, sent)) in enumerate(words.items()):
            seed["v:" + k] = {"w": w, "lemma": k, "meaning": m, "more": [m] + more, "def": d, "pos": pos, "sentence": sent,
                              "src": {"title": "The Quiet Habit of Reading Slowly", "url": SITE + "article.html"}, "t": now - i * 3600_000 * 7}
        mins = [12, 25, 8, 31, 0, 18, 22, 40, 15, 27, 33, 19, 46, 24]
        for i, m in enumerate(mins):
            d = (datetime.date.today() - datetime.timedelta(days=13 - i)).isoformat()
            seed["day:" + d] = {"ms": m * 60000, "n": max(0, m // 3)}
        lib.evaluate("s => chrome.storage.local.set(s)", seed)
        lib.close()

        # ---------- 3. "your words" chip on the page ----------
        pg.goto(SITE + "article.html"); pg.wait_for_timeout(2500)
        shot(pg, "web_chip")
        meta["chip"] = {"x": W - 95, "y": H - 34}
        pg.mouse.click(W - 95, H - 34); pg.wait_for_timeout(600)
        shot(pg, "web_chip_open")

        # ---------- 3b. save the page (button at the bottom of the open panel), name it in the "Saved" message ----------
        # The panel lives in a closed shadow root, so its button is found by position: panel bottom-right, above the chip.
        meta["save_btn"] = {"x": W - 16 - 171, "y": H - 16 - 34 - 8 - 25}
        pg.mouse.move(meta["save_btn"]["x"], meta["save_btn"]["y"]); pg.wait_for_timeout(300)
        shot(pg, "web_save_hover")
        pg.mouse.click(meta["save_btn"]["x"], meta["save_btn"]["y"]); pg.wait_for_timeout(2500)
        shot(pg, "web_saved")
        meta["toast_name"] = {"x": W / 2 + 30, "y": H - 24 - 21}
        pg.mouse.click(meta["toast_name"]["x"], meta["toast_name"]["y"]); pg.wait_for_timeout(200)
        pg.keyboard.press("Control+A"); pg.keyboard.type("Reading slowly")
        shot(pg, "web_saved_named")
        pg.keyboard.press("Enter"); pg.wait_for_timeout(600)

        # ---------- 4. PDF reader ----------
        v = ctx.new_page()
        v.goto(base + "viewer.html?file=" + SITE + "article.pdf")
        v.wait_for_selector(".textLayer span", timeout=20000); v.wait_for_timeout(2500)
        v.evaluate("""() => { const f = document.getElementById('viewerContainer'); f.scrollTop = 0; }""")
        v.wait_for_timeout(800)
        shot(v, "pdf_plain")
        # highlights through the reader's own selection buttons
        for start, end, color in [("the most resilient", "finally gives way.", 0),
                                  ("Keep a short list", "a few days later", 1)]:
            ok = v.evaluate("""([start, end, color]) => {
              const nodes = []; for (const L of document.querySelectorAll('.textLayer')) { const tw = document.createTreeWalker(L, NodeFilter.SHOW_TEXT); while (tw.nextNode()) nodes.push(tw.currentNode); }
              let all = '', map = [];
              for (const n of nodes) { map.push([n, all.length]); all += n.data; }
              const i = all.indexOf(start), j = all.indexOf(end, i);
              if (i < 0 || j < 0) return [i, j];
              const at = (pos) => { for (let k = map.length - 1; k >= 0; k--) if (map[k][1] <= pos) return [map[k][0], pos - map[k][1]]; };
              const a = at(i), b = at(j + end.length - 1);
              const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1] + 1);
              window.BPD_SELECTION_EXTRAS(r)[color].onClick();
              return true;
            }""", [start, end, color])
            print("highlight", ok, flush=True)
        # bring the word to the middle of the screen before double-clicking it
        v.evaluate("""() => { const c = document.getElementById('viewerContainer');
          const s = [...document.querySelectorAll('.textLayer span')].find((x) => x.textContent.includes('deliberate'));
          c.scrollTop += s.getBoundingClientRect().top - 330; }""")
        v.wait_for_timeout(800)
        r = rect_of(v, "deliberate", 0, ".textLayer"); meta["pdf_word"] = r
        shot(v, "pdf_pre")
        v.mouse.move(*center(r)); v.mouse.dblclick(*center(r)); v.wait_for_timeout(3500)
        shot(v, "pdf_popup")
        v.mouse.click(30, 450); v.keyboard.press("Escape"); v.wait_for_timeout(300)
        r = rect_of(v, "Each small pause adds up", 0, ".textLayer"); meta["pdf_sel"] = r
        v.mouse.move(r["x"] + 1, r["y"] + r["h"] / 2); v.mouse.down(); v.mouse.move(r["x"] + r["w"] - 1, r["y"] + r["h"] / 2, steps=10); v.mouse.up()
        v.wait_for_timeout(700)
        shot(v, "pdf_bar")
        v.mouse.click(30, 450); v.keyboard.press("Escape"); v.wait_for_timeout(300)
        meta["notes_btn"] = box(v, "#notesBtn")
        v.click("#notesBtn"); v.wait_for_timeout(800)
        shot(v, "pdf_notes")
        meta["words_tab"] = box(v, "#side [data-pane=words]")
        v.click("#side [data-pane=words]"); v.wait_for_timeout(800)
        shot(v, "pdf_words")
        v.click("#side .close"); v.wait_for_timeout(400)
        meta["pdf_title"] = v.evaluate("() => { const b = document.getElementById('title').getBoundingClientRect(); return {x:b.left,y:b.top,w:b.width,h:b.height}; }")
        v.click("#title"); v.wait_for_timeout(200)
        v.keyboard.press("Control+A"); v.keyboard.type("Reading Slowly — Essay")
        shot(v, "pdf_rename")
        v.keyboard.press("Enter"); v.wait_for_timeout(600)
        # some reading time on this PDF
        v.evaluate("""async () => { const all = await chrome.storage.local.get(null);
          for (const [k, d] of Object.entries(all)) if (k.startsWith('doc:')) { d.ms = 47 * 60000; d.page = 2; await chrome.storage.local.set({[k]: d}); } }""")
        v.wait_for_timeout(500)

        # ---------- 4b. the saved copy in the page reader ----------
        lib = ctx.new_page(); lib.goto(base + "library.html"); lib.wait_for_timeout(300)
        pid = lib.evaluate("async () => Object.keys(await chrome.storage.local.get(null)).find(k => k.startsWith('page:')).slice(5)")
        lib.close()
        rd = ctx.new_page(); rd.goto(base + "reader.html?id=" + pid); rd.wait_for_timeout(1500)
        for text, color, note in [("Slow reading is not a lack of skill.", 0, ""), ("test yourself before you peek at the meaning", 2, "Try this with Revise → fill in the blank")]:
            rd.evaluate("""([text, color, note]) => {
              const c = document.getElementById('content'), w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
              let all = '', map = []; while (w.nextNode()) { map.push([w.currentNode, all.length]); all += w.currentNode.data; }
              const i = all.indexOf(text); if (i < 0) return;
              const at = (pos) => { for (let k = map.length - 1; k >= 0; k--) if (map[k][1] <= pos) return [map[k][0], pos - map[k][1]]; };
              const a = at(i), b = at(i + text.length - 1), r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1] + 1);
              window.BPD_SELECTION_EXTRAS(r)[note ? 4 : color].onClick(); // 4 = "Note": highlight and open the note box
            }""", [text, color, note])
            if note:
                rd.wait_for_timeout(400); rd.fill(".bpd-editor textarea", note)
                rd.locator(".bpd-editor .sw").nth(color).click(); rd.click(".bpd-editor .done")
        rd.wait_for_timeout(400)
        shot(rd, "reader_plain")
        meta["reader_notes"] = box(rd, "#notesBtn")
        rd.click("#notesBtn"); rd.wait_for_timeout(700)
        shot(rd, "reader_notes")
        meta["reader_words"] = box(rd, "#side [data-pane=words]")
        rd.click("#side [data-pane=words]"); rd.wait_for_timeout(700)
        shot(rd, "reader_words")

        # ---------- 5. Library ----------
        lib = ctx.new_page()
        for tab in ["pdfs", "words", "revise", "time"]:
            lib.goto(base + "library.html#" + tab); lib.wait_for_timeout(1200)
            shot(lib, "lib_" + tab)
        lib.goto(base + "library.html#words"); lib.wait_for_timeout(500)
        meta["recall"] = box(lib, "#recallToggle")
        lib.click("#recallToggle"); lib.wait_for_timeout(800)
        shot(lib, "lib_words_recall")
        lib.evaluate("() => chrome.storage.local.set({ rvPrefs: { pool: 'src', count: 10, order: 'random', dir: 'cloze' } })")
        lib.goto(base + "library.html#revise"); lib.wait_for_timeout(1000)
        shot(lib, "lib_revise")
        btn = lib.query_selector("#revise button.primary")
        meta["revise_start"] = box(lib, "#revise button.primary")
        if btn: btn.click(); lib.wait_for_timeout(900); shot(lib, "lib_revise_card")

        json.dump(meta, open(os.path.join(HERE, "meta.json"), "w"), indent=1)
        ctx.close()

main()
