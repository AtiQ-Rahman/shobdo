// Finds "your words" (saved + looked up before) in a piece of text. Used by the PDF reader and on websites.
(() => {
  if (window.BPDWords) return;

  // Cheap inflection handling so "running", "decided", "studies" match run / decide / study.
  function variants(t) {
    const v = [t];
    const add = (x) => x.length > 2 && v.push(x);
    if (t.endsWith("ies")) add(t.slice(0, -3) + "y");
    if (t.endsWith("es")) add(t.slice(0, -2));
    if (t.endsWith("s") && !t.endsWith("ss")) add(t.slice(0, -1));
    if (t.endsWith("ied")) add(t.slice(0, -3) + "y");
    if (t.endsWith("ed")) { add(t.slice(0, -2)); add(t.slice(0, -1)); }
    if (t.endsWith("ing")) { add(t.slice(0, -3)); add(t.slice(0, -3) + "e"); }
    for (const x of [...v]) if (/([b-df-hj-np-tv-z])\1$/.test(x)) add(x.slice(0, -1));
    return v;
  }

  // Word family: "intimidate", "intimidation", "intimidating" all reduce to "intimid".
  // Conservative: the stem must keep at least 5 letters, so short words (mention/mentor, state) stay apart.
  const SUF = ["ations", "itions", "ation", "ition", "ments", "ingly", "ively", "ities", "ating", "ated", "ates", "ions",
    "ment", "ness", "ings", "ers", "ors", "ive", "ion", "ing", "ate", "ity", "edly", "ed", "er", "or", "es", "ly", "s"];
  function stem(t) {
    if (t.length < 6) return t;
    let s = t;
    for (const suf of SUF) if (s.endsWith(suf) && s.length - suf.length >= 5) { s = s.slice(0, -suf.length); break; }
    if (s.endsWith("e") && s.length > 5) s = s.slice(0, -1);
    if (s.endsWith("i") && s.length >= 5) s = s.slice(0, -1) + "y";
    if (/([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1);
    return s;
  }

  // stem -> entry, rebuilt after the map changes
  const stems = new WeakMap();
  function stemIndex(map) {
    let idx = stems.get(map);
    if (idx) return idx;
    idx = new Map();
    for (const [f, e] of map) {
      if (!/^[a-z]/.test(f)) continue;
      const k = stem(f), old = idx.get(k);
      if (!old || (e.saved && !old.saved)) idx.set(k, e);
    }
    stems.set(map, idx);
    return idx;
  }

  // form -> { key, word, meaning, def, saved, session }
  // Only saved words come from storage; words looked up during this visit are added with add().
  async function load() {
    return fromAll(await chrome.storage.local.get(null));
  }
  // The same, from storage contents you already have (the Library reads everything at once).
  function fromAll(all) {
    const map = new Map();
    for (const [k, s] of Object.entries(all)) {
      if (!k.startsWith("v:")) continue;
      const lemma = (s.lemma || s.w).toLowerCase();
      const forms = [...new Set([lemma, s.w.toLowerCase(), ...((all["h:" + lemma] || {}).forms || [])])];
      add(map, { word: lemma, forms, meaning: s.meaning || "", def: s.def || "", saved: true });
    }
    return map;
  }

  function add(map, { word, forms = [], meaning = "", def = "", saved = false }) {
    stems.delete(map);
    const key = word.toLowerCase();
    const old = [...map.values()].find((e) => e.key === key);
    if (old && (old.saved || !saved)) { // keep the saved entry; just learn new forms
      if (meaning && !old.meaning) old.meaning = meaning;
      if (def && !old.def) old.def = def;
      for (const f of [key, ...forms]) if (!map.has(f)) map.set(f, old);
      return old;
    }
    const e = { key, word: key, meaning: meaning || old?.meaning || "", def: def || old?.def || "", saved, session: !saved };
    for (const [f, v] of map) if (v === old) map.set(f, e);
    for (const f of [key, ...forms]) map.set(f.toLowerCase(), e);
    return e;
  }

  const WORD = /[A-Za-z]+(?:['’][a-z]+)?|[ঀ-৿]+/g;

  function match(map, token) {
    const t = token.toLowerCase();
    if (map.has(t)) return map.get(t);
    if (!/^[a-z]/.test(t)) return null;
    for (const v of variants(t)) if (map.has(v)) return map.get(v);
    return stemIndex(map).get(stem(t)) || null;
  }

  // -> Map key -> { word, meaning, saved, count, forms:Set, pages:Set }
  function scan(map, text, page, into = new Map()) {
    if (!map.size) return into;
    let m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(text))) {
      const e = match(map, m[0]);
      if (!e) continue;
      let r = into.get(e.key);
      if (!r) into.set(e.key, (r = { ...e, count: 0, forms: new Set(), pages: new Set() }));
      r.count++; r.forms.add(m[0]);
      if (page) r.pages.add(page);
    }
    return into;
  }

  function sorted(found) {
    return [...found.values()].sort((a, b) => (b.saved - a.saved) || b.count - a.count || a.word.localeCompare(b.word));
  }

  window.BPDWords = { load, fromAll, add, scan, match, sorted, WORD };
})();
