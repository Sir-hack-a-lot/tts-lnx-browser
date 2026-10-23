// Player-statemachine: speelt zinnen af via engine + audio-adapter.
// `generation` beschermt tegen race-conditions na seek/stop: verlate
// synthese- of afspaelresultaten van een oude generatie worden genegeerd.
export function createPlayer({
  engine, audio, onEvent,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, progressMs = 100,
}) {
  let sentences = [];
  let voice = null;
  let rate = 1;
  let idx = -1;
  let state = 'idle'; // idle | loading | playing | paused
  let generation = 0;
  let ticker = null;
  const cache = new Map(); // index → Promise<{audio, boundaries}>

  const emit = (e) => onEvent?.(e);
  const setState = (s) => { state = s; emit({ type: 'state', state: s }); };

  function startTicker(gen) {
    stopTicker();
    ticker = setIntervalImpl(() => {
      if (gen === generation) emit({ type: 'progress', index: idx, elapsedMs: audio.currentTimeMs() });
    }, progressMs);
  }
  function stopTicker() {
    if (ticker !== null) { clearIntervalImpl(ticker); ticker = null; }
  }

  function prefetch(i) {
    if (i < 0 || i >= sentences.length || cache.has(i)) return;
    const p = engine.synthesize({ text: sentences[i].text, voice, rate });
    // Prefetch-fouten worden mogelijk nooit ge-await (zin wordt overgeslagen):
    // noop-catch voorkomt unhandled rejections; playIndex vangt de echte fout zelf af.
    p.catch(() => {});
    cache.set(i, p);
  }

  async function playIndex(i) {
    const gen = generation;
    idx = i;
    setState('loading');
    if (!cache.has(i)) prefetch(i);
    prefetch(i + 1);
    try {
      const { audio: blob, boundaries } = await cache.get(i);
      if (gen !== generation) return;
      cache.delete(i);
      setState('playing');
      emit({ type: 'sentence-start', index: i, boundaries });
      startTicker(gen);
      await audio.play(blob);
      if (gen !== generation) return;
      stopTicker();
      emit({ type: 'sentence-end', index: i });
      if (i + 1 < sentences.length) {
        playIndex(i + 1);
      } else {
        setState('idle');
        emit({ type: 'end' });
      }
    } catch (err) {
      if (gen !== generation) return;
      stopTicker();
      setState('idle');
      emit({ type: 'error', message: String(err?.message || err) });
    }
  }

  return {
    start({ sentences: s, voice: v, rate: r }) {
      generation++;
      stopTicker();
      if (idx >= 0) audio.stop(); // alleen stoppen als er al iets liep
      cache.clear();
      sentences = s;
      voice = v;
      rate = r ?? 1;
      playIndex(0);
    },
    pause() {
      if (state !== 'playing') return;
      audio.pause();
      stopTicker();
      setState('paused');
    },
    resume() {
      if (state !== 'paused') return;
      audio.resume();
      setState('playing');
      startTicker(generation);
    },
    stop() {
      if (state === 'idle' && idx === -1) return;
      generation++;
      stopTicker();
      audio.stop();
      cache.clear();
      idx = -1;
      setState('idle');
    },
    seek(i) {
      if (!sentences.length) return;
      const target = Math.min(Math.max(0, i), sentences.length - 1);
      generation++;
      stopTicker();
      audio.stop();
      cache.clear();
      playIndex(target);
    },
    setRate(r) {
      rate = r;
      cache.clear(); // toekomstige zinnen worden opnieuw gesynthetiseerd
      if (idx >= 0) prefetch(idx + 1);
    },
    currentIndex() { return idx; },
  };
}
