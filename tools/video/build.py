# Builds the video timeline (timeline.json) and the full soundtrack (audio/mix.wav): narration + SFX + a soft music bed.
import json, os, subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
SR = 44100
meta = json.load(open("meta.json"))
S = 1.2  # CSS px -> screenshot px
def C(r, dx=0.5, dy=0.5): return [(r["x"] + r["w"] * dx) * S, (r["y"] + r["h"] * dy) * S]
def dur(f): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)

VO_AT = 0.6
vo = {k: dur(f"audio/{k}.mp3") for k, _ in json.load(open("vo.json"))}
def D(k, tail=0.8): return round(VO_AT + vo[k] + tail, 2)

W = C(meta["web_word"]); s = meta["web_sent"]
sx0, sx1, sy, sh = s["first"]["x"] * S, s["last"]["x"] * S, s["first"]["y"] * S, s["first"]["h"] * S
TR = [meta["web_bar_btn"]["x"] * S, meta["web_bar_btn"]["y"] * S]
CHIP = [meta["chip"]["x"] * S, meta["chip"]["y"] * S]
PW = C(meta["pdf_word"]); PS = meta["pdf_sel"]
PSEL_END = [(PS["x"] + PS["w"]) * S, (PS["y"] + PS["h"] / 2) * S]
NOTES = C(meta["notes_btn"]); WTAB = C(meta["words_tab"]); TITLE = C(meta["pdf_title"], 0.4)
RECALL = C(meta["recall"]); START = C(meta["revise_start"])
SAVE = [meta["save_btn"]["x"] * S, meta["save_btn"]["y"] * S]; TNAME = [meta["toast_name"]["x"] * S, meta["toast_name"]["y"] * S]
RNOTES = C(meta["reader_notes"]); RWORDS = C(meta["reader_words"])
FAM = C(meta["family_word"]); BACK = C(meta["back_btn"]); GT = C(meta["gt_btn"])

scenes = [
  dict(id="intro", kind="card", vo="intro", dur=D("intro", 1.0), sfx=[(0.1, "chime")]),
  dict(id="word", vo="word", dur=D("word"), step="01  LOOK UP",
       caps=[(0.3, "Double-click <i>any word</i>")],
       shots=[(0, "web_plain"), (2.55, "web_popup")],
       cam=[[0, 960, 540, 1], [0.9, 960, 540, 1], [2.2, W[0], W[1] + 60, 1.55], [3.2, 1225, 700, 1.6], [11, 1225, 720, 1.66]],
       cursor=[[0.4, 1450, 900], [2.05, *W]], clicks=[2.2, 2.34], cursorOff=3.6, sfx=[(2.55, "pop")]),
  dict(id="family", vo="family", dur=D("family"), step="02  WORD FAMILY",
       caps=[(0.3, "See the <i>word family</i>"), (3.0, "Look up words <i>inside the box</i>")],
       shots=[(0, "web_popup"), (3.0, "web_inside")],
       cam=[[0, 1225, 720, 1.66], [1.2, FAM[0] + 60, FAM[1], 1.9], [2.6, FAM[0] + 60, FAM[1], 1.9], [3.6, 1225, 640, 1.7], [11, 1225, 650, 1.74]],
       cursor=[[0.3, 1300, 900], [2.4, *FAM], [6.5, FAM[0], FAM[1] - 60], [8.0, *BACK], [11, BACK[0] + 4, BACK[1] + 2]],
       clicks=[2.8], sfx=[(3.0, "pop")]),
  dict(id="passage", vo="passage", dur=D("passage"), step="03  TRANSLATE",
       caps=[(0.3, "Select a sentence, <i>translate</i> it")],
       shots=[(0, "web_plain"), (2.0, "web_bar"), (3.55, "web_passage")],
       cam=[[0, 700, 600, 1.7], [7, 720, 610, 1.78]],
       cursor=[[0.3, 950, 760], [0.9, sx0, sy + sh / 2], [1.9, sx1, sy + sh / 2], [2.9, *TR]],
       sel=dict(t0=0.9, t1=1.9, t2=2.05, x0=sx0, x1=sx1, y=sy, h=sh),
       clicks=[3.35], cursorOff=4.5, sfx=[(0.9, "click"), (1.9, "click"), (2.0, "tick"), (3.55, "pop")]),
  dict(id="google", vo="google", dur=D("google"), step="04  GOOGLE",
       caps=[(0.3, "One click to <i>Google Translate</i>")],
       shots=[(0, "web_passage"), (1.2, "web_gt_hover"), (2.3, "web_gt", 0.35)],
       cam=[[0, 720, 610, 1.78], [1.4, GT[0] - 60, GT[1] + 40, 1.9], [2.2, GT[0] - 60, GT[1] + 40, 1.9], [3.3, 1200, 520, 1.12], [9, 1210, 520, 1.16]],
       cursor=[[0.3, 900, 700], [1.6, *GT]], clicks=[2.1], cursorOff=2.6, sfx=[(2.3, "whoosh")]),
  dict(id="chip", vo="chip", dur=D("chip"), step="05  YOUR WORDS",
       caps=[(0.3, "Saved words, <i>spotted on every page</i>"), (5.6, "intimidate · <i>intimidation</i> — same word")],
       shots=[(0, "web_chip"), (2.6, "web_chip_open")],
       cam=[[0, 960, 540, 1], [0.8, 960, 540, 1], [2.0, 1600, 880, 1.55], [3.1, 1640, 720, 1.5], [9, 1650, 700, 1.6]],
       cursor=[[0.4, 1250, 650], [2.1, *CHIP], [3.4, CHIP[0], CHIP[1]], [5.4, 1870, 575], [9, 1870, 585]],
       clicks=[2.4], sfx=[(2.6, "pop")]),
  dict(id="save", vo="save", dur=D("save"), step="06  SAVE PAGES",
       caps=[(0.3, "Save a page <i>to read later</i>"), (3.6, "Give it a <i>short name</i>")],
       shots=[(0, "web_chip_open"), (1.2, "web_save_hover"), (2.3, "web_saved"), (3.9, "web_saved_named")],
       cam=[[0, 1650, 700, 1.6], [1.0, 1600, 860, 1.6], [2.6, 1500, 900, 1.45], [3.3, 1150, 900, 1.55], [9, 1150, 910, 1.62]],
       cursor=[[0.3, 1870, 585], [1.1, *SAVE], [2.6, SAVE[0], SAVE[1]], [3.3, *TNAME]], clicks=[2.15, 3.45], cursorOff=4.0,
       sfx=[(2.3, "pop")] + [(3.95 + i * 0.085, "key") for i in range(14)]),
  dict(id="reader", vo="reader", dur=D("reader"), step="07  READ LATER",
       caps=[(0.3, "Your saved copy: <i>highlights</i>, <i>notes</i>, <i>words</i>")],
       shots=[(0, "reader_plain"), (2.7, "reader_notes"), (5.9, "reader_words")],
       cam=[[0, 960, 540, 1], [0.8, 960, 540, 1], [2.0, 760, 620, 1.35], [3.0, 1300, 420, 1.2], [9, 1320, 430, 1.25]],
       cursor=[[0.3, 1100, 900], [2.4, *RNOTES], [5.5, *RWORDS], [9, RWORDS[0] + 40, RWORDS[1] + 260]],
       clicks=[2.55, 5.75], sfx=[(2.7, "pop"), (5.9, "tick")]),
  dict(id="pdf", vo="pdf", dur=D("pdf"), step="08  PDF READER",
       caps=[(0.3, "PDFs: <i>look up</i> &amp; <i>highlight</i>")],
       shots=[(0, "pdf_pre"), (2.45, "pdf_popup"), (5.4, "pdf_bar", 0.3)],
       cam=[[0, 960, 540, 1], [0.9, 960, 540, 1], [2.1, PW[0], PW[1] + 80, 1.3], [3.0, 1250, 700, 1.35], [4.9, 1250, 700, 1.35], [5.7, 1250, 560, 1.3], [8.5, 1260, 560, 1.36]],
       cursor=[[0.4, 600, 820], [2.0, *PW], [4.8, *PW], [5.4, *PSEL_END], [6.6, PSEL_END[0] + 40, PSEL_END[1] + 50], [8.5, PSEL_END[0] + 100, PSEL_END[1] + 52]],
       clicks=[2.15, 2.28], sfx=[(2.45, "pop"), (5.4, "tick")]),
  dict(id="notes", vo="notes", dur=D("notes"), step="09  NOTES",
       caps=[(0.3, "Highlights, notes &amp; <i>your words</i> per PDF")],
       shots=[(0, "pdf_pre"), (1.2, "pdf_notes"), (3.9, "pdf_words")],
       cam=[[0, 1200, 500, 1.15], [1.4, 1560, 420, 1.45], [7, 1580, 440, 1.5]],
       cursor=[[0.3, 1100, 600], [1.0, *NOTES], [3.0, NOTES[0] - 30, NOTES[1] + 160], [3.7, *WTAB], [7, WTAB[0] + 60, WTAB[1] + 300]],
       clicks=[1.05, 3.75], sfx=[(1.2, "pop"), (3.9, "tick")]),
  dict(id="rename", vo="rename", dur=D("rename"), step="10  RENAME",
       caps=[(0.3, "Click the title to <i>rename</i> a PDF")],
       shots=[(0, "pdf_words"), (1.3, "pdf_rename")],
       cam=[[0, 960, 540, 1.1], [1.0, 520, 160, 2.1], [5.5, 520, 160, 2.2]],
       cursor=[[0.3, 900, 500], [1.0, *TITLE]], clicks=[1.15], cursorOff=1.5,
       sfx=[(1.3, "tick")] + [(1.55 + i * 0.085, "key") for i in range(18)]),
  dict(id="library", vo="library", dur=D("library"), step="11  LIBRARY",
       caps=[(0.3, "Every saved word <i>in one place</i>"), (5.6, "<i>Recall mode</i>: test yourself")],
       shots=[(0, "lib_words"), (5.6, "lib_words_recall")],
       cam=[[0, 960, 380, 1.4], [4.6, 960, 600, 1.4], [5.3, 900, 320, 1.5], [10, 900, 380, 1.5]],
       cursor=[[0.4, 1250, 700], [4.6, 1200, 500], [5.3, *RECALL]], clicks=[5.45], cursorOff=7.5, sfx=[(5.6, "tick")]),
  dict(id="revise", vo="revise", dur=D("revise"), step="12  REVISE",
       caps=[(0.3, "Revise by page, or <i>fill in the blank</i>")],
       shots=[(0, "lib_revise"), (1.3, "lib_revise_card")],
       cam=[[0, 760, 560, 1.45], [1.4, 840, 320, 1.65], [5, 840, 330, 1.7]],
       cursor=[[0.3, 1000, 880], [1.0, *START]], clicks=[1.15], cursorOff=1.6, sfx=[(1.3, "pop")]),
  dict(id="time", vo="time", dur=D("time"), step="13  READING TIME",
       caps=[(0.3, "Watch your <i>reading habit</i> grow")],
       shots=[(0, "lib_time")],
       cam=[[0, 960, 420, 1.3], [6.5, 960, 400, 1.58]]),
  dict(id="outro", kind="card", vo="outro", dur=D("outro", 2.4), last=True, sfx=[(0.1, "chime")]),
]
t = 0
for sc in scenes:
    sc["start"] = round(t, 3); t += sc["dur"]
    sc.setdefault("kind", "shot"); sc.setdefault("caps", []); sc.setdefault("shots", [])
TOTAL = round(t, 3)
shots = sorted({n for sc in scenes for _, n, *_ in sc["shots"]})
json.dump({"scenes": scenes, "total": TOTAL, "shots": shots}, open("timeline.json", "w"))
print("total", TOTAL, "s")

# ---------------- audio ----------------
N = int((TOTAL + 0.5) * SR)
mix = np.zeros((N, 2))
rng = np.random.default_rng(7)
def tt(d): return np.arange(int(d * SR)) / SR
def env(n, a, r):
    e = np.ones(n); ai, ri = int(a * SR), int(r * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if ri: e[-ri:] *= np.linspace(1, 0, ri) ** 2
    return e
def lowpass(x, cut):
    a = np.exp(-2 * np.pi * cut / SR); y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x): acc = (1 - a) * v + a * acc; y[i] = acc
    return y
def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR); sig = sig[: max(0, N - i)]
    if sig.ndim == 1: sig = np.stack([sig * (1 - max(0, pan)), sig * (1 + min(0, pan))], 1)
    mix[i:i + len(sig)] += sig * gain

def sfx_click():
    x = tt(0.03); s = np.sin(2 * np.pi * 2600 * x) * np.exp(-x * 260) + rng.normal(0, 1, len(x)) * np.exp(-x * 600) * 0.5
    return s * 0.5
def sfx_tick():
    x = tt(0.05); return np.sin(2 * np.pi * 1800 * x) * np.exp(-x * 140) * 0.35
def sfx_key():
    x = tt(0.035); n = rng.normal(0, 1, len(x)) * np.exp(-x * 280)
    return (n * 0.25 + np.sin(2 * np.pi * (900 + rng.integers(0, 400)) * x) * np.exp(-x * 300) * 0.15)
def sfx_pop():
    x = tt(0.16); f = 520 + 700 * (x / 0.16) ** 0.5
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-x * 26) * env(len(x), 0.004, 0.04) * 0.45
def sfx_whoosh():
    d = 0.7; x = tt(d); n = rng.normal(0, 1, len(x))
    # band sweep: two one-pole low-passes with a moving cutoff approximated by blending
    lo = lowpass(n, 500); hi = lowpass(n, 3000) - lowpass(n, 900)
    k = np.sin(np.pi * x / d)
    s = (lo * (1 - x / d) + hi * (x / d)) * k ** 2
    return s / (np.abs(s).max() + 1e-9) * 0.28
def sfx_chime():
    x = tt(2.4); s = 0
    for f, g, dl in [(659.25, 1, 0), (987.77, .7, 0.09), (1318.5, .45, 0.18)]:
        xs = np.clip(x - dl, 0, None); s = s + g * np.sin(2 * np.pi * f * xs) * np.exp(-xs * 2.2) * (x >= dl)
        s = s + g * 0.3 * np.sin(2 * np.pi * f * 2.01 * xs) * np.exp(-xs * 4) * (x >= dl)
    return s * env(len(x), 0.005, 0.3) * 0.22
SFX = {"click": sfx_click, "tick": sfx_tick, "key": sfx_key, "pop": sfx_pop, "whoosh": sfx_whoosh, "chime": sfx_chime}

def load(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)

# soft music bed: slow pad chords (Cmaj7 - Am7 - Fmaj7 - G6), quiet under the voice
def pad():
    chords = [[261.63, 329.63, 392.0, 493.88], [220.0, 261.63, 329.63, 392.0], [174.61, 220.0, 261.63, 329.63], [196.0, 246.94, 293.66, 329.63]]
    seg = 4.0; out = np.zeros(N)
    i = 0; at = 0.0
    while at < TOTAL + 0.5:
        ch = chords[i % 4]; x = tt(seg + 1.5); s = 0
        for j, f in enumerate(ch):
            for h, g in [(1, 1), (2, .25), (3, .08)]:
                s = s + g * np.sin(2 * np.pi * f * h * x + j) * (1 + 0.003 * np.sin(2 * np.pi * 0.3 * x))
        s += 0.5 * np.sin(2 * np.pi * ch[0] / 2 * x)  # bass
        s *= env(len(x), 1.2, 1.5)
        a = int(at * SR); s = s[: max(0, N - a)]; out[a:a + len(s)] += s
        at += seg; i += 1
    out = lowpass(out, 1400)
    out /= np.abs(out).max() + 1e-9
    fade = np.ones(N); fi = int(1.5 * SR); fo = int(3 * SR)
    fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
    return out * fade

voice = np.zeros(N)
for sc in scenes:
    v = load(f"audio/{sc['vo']}.mp3"); i = int((sc["start"] + VO_AT) * SR); v = v[: N - i]; voice[i:i + len(v)] += v
# duck the music under the narration
act = np.convolve(np.abs(voice) > 0.02, np.ones(int(0.25 * SR)) / int(0.25 * SR), "same")
duck = 1 - 0.55 * np.clip(act * 4, 0, 1)
duck = lowpass(duck, 3)
music = pad() * 0.13 * duck
mix += np.stack([music, music], 1)
mix += np.stack([voice, voice], 1) * 0.95
for k, sc in enumerate(scenes):
    if k: place(SFX["whoosh"](), sc["start"] - 0.3, 1.0, pan=0.0)
    for at, name in sc.get("sfx", []): place(SFX[name](), sc["start"] + at, 1.0, pan=0.15 if name in ("click", "key") else 0)
    for ct in sc.get("clicks", []): place(SFX["click"](), sc["start"] + ct, 1.0, pan=0.1)
peak = np.abs(mix).max(); mix = mix / peak * 0.92 if peak > 0.92 else mix
import wave
with wave.open("audio/mix.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
print("audio ok", round(len(mix) / SR, 2))
