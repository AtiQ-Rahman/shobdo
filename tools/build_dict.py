#!/usr/bin/env python3
"""Build the offline dictionary shards in ../data from raw sources.

Usage: python3 -I tools/build_dict.py <wordnet dict dir> <MinhasKamal BengaliDictionary dir> <en_50k.txt> <out dir>

Sources
  - WordNet 3.1 (Princeton WordNet license): English definitions, examples, synonyms, antonyms, base forms.
  - MinhasKamal/BengaliDictionary (GPL-3.0): English -> Bangla meanings.
  - hermitdave/FrequencyWords en_50k (CC-BY-SA 4.0): how common a word is.

Output
  data/en/<xy>.json   word -> {"b": [bangla...], "f": 1 if bangla only from the noisy list,
                               "d": [[pos, definition, example]], "s": [synonyms], "a": [antonyms], "r": rank}
  data/bn/<hex>.json  bangla term -> [english words]
  data/exc.json       irregular form -> [base forms]   (ran -> run, mice -> mouse)
"""
import csv, json, os, re, sys
from collections import defaultdict

wn, bnd, freq_path, out = sys.argv[1:5]
POS = {"n": "noun", "v": "verb", "a": "adjective", "s": "adjective", "r": "adverb"}
FILES = {"n": "noun", "v": "verb", "a": "adj", "r": "adv"}
MAX_SENSES_PER_POS, MAX_SENSES = 3, 6

def norm(w): return w.replace("_", " ").lower().strip()

# ---- WordNet ----
synsets = {}  # (p, offset) -> {"words": [...], "gloss": str, "ptrs": [...]}
for p, name in FILES.items():
    with open(os.path.join(wn, "data." + name), encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("  "): continue
            body, _, gloss = line.partition(" | ")
            t = body.split()
            off, ss_type, wcnt = t[0], t[2], int(t[3], 16)
            words = [re.sub(r"\(.*\)$", "", t[4 + 2 * i]) for i in range(wcnt)]
            k = 4 + 2 * wcnt
            pcnt = int(t[k]); k += 1
            ptrs = []
            for _ in range(pcnt):
                sym, toff, tpos, st = t[k:k + 4]; k += 4
                ptrs.append((sym, toff, tpos, st))
            synsets[(p, off)] = {"type": ss_type, "words": words, "gloss": gloss.strip(), "ptrs": ptrs}

def split_gloss(g):
    parts = [x.strip() for x in g.split(";")]
    defs = [x for x in parts if x and not x.startswith('"')]
    exs = [x.strip('"').strip() for x in parts if x.startswith('"')]
    return "; ".join(defs), (exs[0] if exs else "")

def ss_key(p, off):
    return (p, off) if (p, off) in synsets else (("a" if p == "s" else p), off)

en = defaultdict(lambda: {"d": [], "s": [], "a": []})
for p, name in FILES.items():
    with open(os.path.join(wn, "index." + name), encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("  "): continue
            t = line.split()
            lemma, pcnt = t[0], int(t[3])
            tagged = int(t[4 + pcnt + 1])
            offs = t[4 + pcnt + 2:]
            w = norm(lemma)
            if " " in w: continue  # double-click only ever selects single words
            e = en[w]
            group = []
            n = 0
            for off in offs:
                ss = synsets.get((p, off))
                if not ss: continue
                if n < MAX_SENSES_PER_POS:
                    d, ex = split_gloss(ss["gloss"])
                    group.append([POS[ss["type"]], d, ex]); n += 1
                for x in ss["words"]:
                    x = norm(x)
                    if x != w and x not in e["s"] and len(e["s"]) < 8: e["s"].append(x)
                for sym, toff, tpos, st in ss["ptrs"]:
                    if sym != "!": continue
                    src, tgt = int(st[:2], 16), int(st[2:], 16)
                    if src and norm(ss["words"][src - 1]) != w: continue
                    tss = synsets.get(ss_key(tpos, toff))
                    if tss and tgt:
                        a = norm(tss["words"][tgt - 1])
                        if a not in e["a"]: e["a"].append(a)
            e.setdefault("g", []).append((tagged, len(offs), group))

exc = defaultdict(list)
for name in FILES.values():
    path = os.path.join(wn, name + ".exc")
    if not os.path.exists(path): continue
    for line in open(path, encoding="utf-8"):
        t = line.split()
        if len(t) >= 2:
            for b in t[1:]:
                b = norm(b)
                if b not in exc[norm(t[0])]: exc[norm(t[0])].append(b)

# Most-used part of speech first (WordNet's tagged-sense counts), so "collect" starts with the verb.
for w, e in en.items():
    for _, _, grp in sorted(e.pop("g", []), key=lambda x: (-x[0], -x[1])):
        e["d"].extend(grp)
    e["d"] = e["d"][:MAX_SENSES]

# ---- Bangla ----
def terms(s):
    out = []
    for x in re.split(r"[,;।]", s or ""):
        x = re.sub(r"\s+", " ", x).strip()
        if x and re.search(r"[ঀ-৿]", x) and len(x) <= 40 and x not in out: out.append(x)
    return out

bn = defaultdict(list)  # rich sources, in priority order
def add(w, ts, target):
    w = norm(w)
    for x in ts:
        if x not in target[w] and len(target[w]) < 10: target[w].append(x)

for e in json.load(open(os.path.join(bnd, "BengaliDictionary.json"), encoding="utf-8-sig")):
    add(e["en"], terms(e["bn"]) + [y for s in e.get("bn_syns", []) for y in terms(s)], bn)
for line in open(os.path.join(bnd, "BengaliDictionary_17.txt"), encoding="utf-8-sig"):
    t = line.strip().strip("|").split("|")
    if len(t) == 2: add(t[0], terms(t[1]), bn)
for r in csv.reader(open(os.path.join(bnd, "BengaliDictionary_36.csv"), encoding="utf-8-sig")):
    if len(r) > 1: add(r[0], terms(r[1]), bn)
noisy = defaultdict(list)
for r in csv.reader(open(os.path.join(bnd, "BengaliDictionary_93.csv"), encoding="utf-8-sig")):
    if len(r) > 1: add(r[0], terms(r[1]), noisy)

rank = {}
for i, line in enumerate(open(freq_path, encoding="utf-8")):
    w = line.split(" ")[0].lower()
    rank.setdefault(w, i + 1)

# ---- merge + shard ----
words = set(en) | set(bn) | set(noisy)
shards = defaultdict(dict)
def shard(w):
    a = w[0] if "a" <= w[0] <= "z" else "_"
    b = w[1] if len(w) > 1 and "a" <= w[1] <= "z" else "_"
    return a + b

for w in words:
    if not w or len(w) > 40 or " " in w: continue
    e = {}
    if w in bn: e["b"] = bn[w]
    elif w in noisy: e["b"] = noisy[w]; e["f"] = 1
    if w in en:
        x = en[w]
        if x["d"]: e["d"] = x["d"]
        if x["s"]: e["s"] = x["s"]
        if x["a"]: e["a"] = x["a"]
    if w in rank: e["r"] = rank[w]
    if e: shards[shard(w)][w] = e

os.makedirs(os.path.join(out, "en"), exist_ok=True)
for k, v in shards.items():
    json.dump(v, open(os.path.join(out, "en", k + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

rev = defaultdict(lambda: defaultdict(list))
for w, ts in bn.items():
    if len(w.split()) > 3: continue
    for x in ts[:6]:
        lst = rev["%04x" % ord(x[0])][x]
        if w not in lst and len(lst) < 8: lst.append(w)
os.makedirs(os.path.join(out, "bn"), exist_ok=True)
for k, v in rev.items():
    json.dump(v, open(os.path.join(out, "bn", k + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

json.dump(exc, open(os.path.join(out, "exc.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("words", len(words), "en shards", len(shards), "bn shards", len(rev), "exceptions", len(exc))
