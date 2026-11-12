// Offline dictionary: WordNet (English) + MinhasKamal BengaliDictionary (Bangla), sharded under data/.
const shardCache = new Map();
let excPromise = null;

async function loadJson(path) {
  if (!shardCache.has(path)) {
    shardCache.set(path, fetch(chrome.runtime.getURL(path)).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  }
  return shardCache.get(path);
}

function shardOf(w) {
  const a = w[0] >= "a" && w[0] <= "z" ? w[0] : "_";
  const b = w[1] >= "a" && w[1] <= "z" ? w[1] : "_";
  return `data/en/${a}${b}.json`;
}

export async function entry(w) {
  if (!w) return null;
  return (await loadJson(shardOf(w)))[w] || null;
}

const RULES = [
  ["s", ""], ["ses", "s"], ["xes", "x"], ["zes", "z"], ["ches", "ch"], ["shes", "sh"], ["men", "man"], ["ies", "y"],
  ["es", "e"], ["es", ""], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""],
  ["er", ""], ["est", ""], ["er", "e"], ["est", "e"], ["ier", "y"], ["iest", "y"], ["ily", "y"], ["ly", ""]
];

// WordNet-style "morphy": irregular forms first, then suffix rules (+ doubled consonant: running -> run).
export async function baseForm(w) {
  excPromise ||= loadJson("data/exc.json");
  const exc = await excPromise;
  const cands = [...(exc[w] || [])];
  for (const [suf, rep] of RULES) {
    if (w.length > suf.length + 1 && w.endsWith(suf)) {
      const c = w.slice(0, -suf.length) + rep;
      cands.push(c);
      if (!rep && /([b-df-hj-np-tv-z])\1$/.test(c)) cands.push(c.slice(0, -1));
    }
  }
  for (const c of cands) {
    if (c === w) continue;
    const e = await entry(c);
    if (e && (e.d || (e.b && !e.f))) return { word: c, entry: e };
  }
  return null;
}

export function level(rank) {
  if (!rank) return { n: 1, label: "Very rare" };
  if (rank <= 1000) return { n: 5, label: "Very common" };
  if (rank <= 5000) return { n: 4, label: "Common" };
  if (rank <= 15000) return { n: 3, label: "Less common" };
  return { n: 2, label: "Rare" };
}

// English word -> everything we know offline.
export async function lookupEnglish(word) {
  const w = word.toLowerCase();
  const [e, base] = await Promise.all([entry(w), baseForm(w)]);
  if (!e && !base) return null;
  const own = e || {};
  const b = base ? base.entry : {};
  const bnTerms = own.b && !own.f ? own.b : b.b && !b.f ? b.b : own.b || b.b || [];
  const rank = Math.min(own.r || Infinity, b.r || Infinity);
  return {
    lemma: base ? base.word : w,
    base: base && base.word !== w ? { word: base.word, bn: (b.b || [])[0] || "" } : null,
    bn: bnTerms,
    defs: own.d || b.d || [],
    syn: own.s || b.s || [],
    ant: own.a || b.a || [],
    level: level(rank === Infinity ? 0 : rank)
  };
}

// Bangla word -> English words (reverse of the Bangla dictionary).
export async function lookupBangla(text) {
  const t = text.trim();
  const shard = await loadJson(`data/bn/${t.codePointAt(0).toString(16).padStart(4, "0")}.json`);
  const en = shard[t] || [];
  if (!en.length) return null;
  const top = await lookupEnglish(en[0]);
  return { en, defs: top ? top.defs.slice(0, 3) : [] };
}
