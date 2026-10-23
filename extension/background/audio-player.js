// Speelt audio-blobs af in de background page (geen autoplay-beperking).
// play() resolveert bij einde van het fragment én bij stop().
export function createAudioPlayer() {
  let el = null;
  let url = null;
  let finish = null;

  function cleanup() {
    if (url) URL.revokeObjectURL(url);
    url = null;
  }

  return {
    play(blob) {
      this.stop();
      url = URL.createObjectURL(blob);
      el = new Audio(url);
      return new Promise((resolve) => {
        finish = resolve;
        el.onended = () => { cleanup(); resolve(); };
        el.onerror = () => { cleanup(); resolve(); };
        el.play().catch(() => { cleanup(); resolve(); });
      });
    },
    pause() { el?.pause(); },
    resume() { el?.play().catch(() => {}); },
    stop() {
      if (el) { el.pause(); el.removeAttribute('src'); }
      cleanup();
      if (finish) { const f = finish; finish = null; f(); }
    },
    currentTimeMs() { return el ? el.currentTime * 1000 : 0; },
  };
}
