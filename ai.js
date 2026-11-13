// AI chat sites the meaning box can send a sentence to (Settings → Ask AI picks which ones show).
// `q`: the site takes the question in its address, so it arrives already typed. Sites without one get
// the question typed into their message box once the page loads (see fillChat in background.js).
// Shared by the meaning box, the Library settings and the background worker.
globalThis.SHOBDO_AI = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", q: "q" },
  { id: "claude", name: "Claude", url: "https://claude.ai/new", q: "q" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
  { id: "grok", name: "Grok", url: "https://grok.com/", q: "q" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "perplexity", name: "Perplexity", url: "https://www.perplexity.ai/search", q: "q", off: true }
];
// Which ones show when you haven't chosen yet.
globalThis.SHOBDO_AI_DEFAULT = SHOBDO_AI.filter((a) => !a.off).map((a) => a.id);
// The question sent along with the text.
globalThis.SHOBDO_AI_PROMPT = (text) => /[ঀ-৿]/.test(text)
  ? `Explain this Bangla text in simple English. Give the meaning of the harder words too:\n\n${text}`
  : `Explain this in simple Bangla (বাংলায় সহজ করে বুঝিয়ে দাও). Give the Bangla meaning of the harder words, and the overall idea:\n\n${text}`;
