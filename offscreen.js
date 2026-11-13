// Plays pronunciation audio for the background worker, outside any page's CSP or autoplay rules.
// Tries each URL in turn and answers true once one actually plays.
async function playFirst(urls) {
  for (const url of urls) {
    try { await new Audio(url).play(); return true; } catch {}
  }
  return false;
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.target !== "offscreen" || msg.type !== "play") return;
  playFirst(msg.urls || []).then(send);
  return true;
});
