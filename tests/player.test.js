import { describe, it, expect } from 'vitest';
import { createPlayer } from '../extension/background/player.js';

const SENTENCES = [{ id: 0, text: 'Een.' }, { id: 1, text: 'Twee.' }, { id: 2, text: 'Drie.' }];
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeEngine() {
  const calls = [];
  return {
    calls,
    synthesize({ text, voice, rate }) {
      calls.push({ text, voice, rate });
      return Promise.resolve({ audio: `blob:${text}`, boundaries: [{ text, offsetMs: 0, durationMs: 100 }] });
    },
  };
}

function fakeAudio() {
  let finishCurrent = null;
  return {
    played: [], pauseCount: 0, resumeCount: 0, stopCount: 0, timeMs: 0,
    play(blob) { this.played.push(blob); return new Promise((r) => { finishCurrent = r; }); },
    pause() { this.pauseCount++; },
    resume() { this.resumeCount++; },
    stop() { this.stopCount++; if (finishCurrent) { const f = finishCurrent; finishCurrent = null; f(); } },
    currentTimeMs() { return this.timeMs; },
    finish() { if (finishCurrent) { const f = finishCurrent; finishCurrent = null; f(); } },
  };
}

function fakeScheduler() {
  const cbs = new Map();
  let next = 1;
  return {
    setInterval: (cb, ms) => { const id = next++; cbs.set(id, cb); return id; },
    clearInterval: (id) => cbs.delete(id),
    tick: () => { for (const cb of [...cbs.values()]) cb(); },
    active: () => cbs.size,
  };
}

function setup() {
  const engine = fakeEngine();
  const audio = fakeAudio();
  const sched = fakeScheduler();
  const events = [];
  const player = createPlayer({
    engine, audio, onEvent: (e) => events.push(e),
    setIntervalImpl: sched.setInterval, clearIntervalImpl: sched.clearInterval,
  });
  return { engine, audio, sched, events, player };
}

describe('createPlayer', () => {
  it('speelt alle zinnen achter elkaar af en eindigt met end', async () => {
    const { engine, audio, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'nl-NL-FennaNeural', rate: 1 });
    await flush();
    // playIndex emit eerst state:'loading'; zoek daarom het eerste sentence-start-event
    expect(events.find((e) => e.type === 'sentence-start')).toMatchObject({ type: 'sentence-start', index: 0 });
    expect(engine.calls).toHaveLength(2); // zin 0 + prefetch zin 1
    audio.finish(); await flush();
    expect(events).toContainEqual({ type: 'sentence-end', index: 0 });
    audio.finish(); await flush();
    audio.finish(); await flush();
    expect(events.at(-1)).toEqual({ type: 'end' });
    expect(player.currentIndex()).toBe(2);
  });

  it('pauzeert en hervat', async () => {
    const { audio, sched, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.pause();
    expect(audio.pauseCount).toBe(1);
    expect(events).toContainEqual({ type: 'state', state: 'paused' });
    expect(sched.active()).toBe(0); // ticker stopt
    player.resume();
    expect(audio.resumeCount).toBe(1);
    expect(sched.active()).toBe(1); // ticker loopt weer
  });

  it('stuurt progress-events met elapsedMs uit de audio-adapter', async () => {
    const { audio, sched, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    audio.timeMs = 1234;
    sched.tick();
    expect(events).toContainEqual({ type: 'progress', index: 0, elapsedMs: 1234 });
  });

  it('seek() springt naar een andere zin en stopt de huidige', async () => {
    const { audio, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.seek(2);
    await flush();
    expect(audio.stopCount).toBe(1);
    // sentence-start bevat ook boundaries; toContainEqual vereist exacte gelijkheid,
    // daarom find + toMatchObject (zelfde patroon als de eerste test)
    expect(events.find((e) => e.type === 'sentence-start' && e.index === 2)).toMatchObject({ type: 'sentence-start', index: 2 });
    expect(player.currentIndex()).toBe(2);
  });

  it('stop() ruimt alles op', async () => {
    const { audio, sched, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.stop();
    await flush();
    expect(audio.stopCount).toBe(1);
    expect(sched.active()).toBe(0);
    expect(events).toContainEqual({ type: 'state', state: 'idle' });
    expect(events.at(-1)).toEqual({ type: 'state', state: 'idle' }); // geen 'end' na stop
  });

  it('setRate() geldt vanaf de volgende synthese', async () => {
    const { engine, audio, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.setRate(1.5);
    audio.finish(); await flush();
    expect(engine.calls.at(-1).rate).toBe(1.5);
  });

  it('stuurt error-event als de engine faalt', async () => {
    const engine = { synthesize: () => Promise.reject(new Error('netwerk stuk')) };
    const audio = fakeAudio();
    const sched = fakeScheduler();
    const events = [];
    const player = createPlayer({
      engine, audio, onEvent: (e) => events.push(e),
      setIntervalImpl: sched.setInterval, clearIntervalImpl: sched.clearInterval,
    });
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    expect(events).toContainEqual({ type: 'error', message: 'netwerk stuk' });
  });
});
