// Unit-tests voor de sessie-levenscyclus van de background-router:
// I1 (tab sluiten/navigeren stopt de player), I2 (STOP tijdens lopende START
// wordt niet gedropt), I3 (sessie-overname ruimt de oude tab op en isoleert
// haar CONTROL-berichten) en de helper-foutpaden (offline + stemkeuze).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MSG, CONTROL } from '../extension/shared/messages.js';

// Fake fetch voor de helper-engine: /health meldt de helper gezond met beide
// engines; /synthesize blijft bewust pending, zodat de player in 'loading'
// blijft zonder dat audio-tests timing-afhankelijk worden.
function makeFetch({ health = { status: 'ok', engines: { edge: true, piper: true } } } = {}) {
  const synthBodies = [];
  const fetchImpl = (url, opts) => {
    if (url.endsWith('/health')) {
      return health === null
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(health) });
    }
    synthBodies.push(JSON.parse(opts.body));
    return new Promise(() => {}); // synthesize blijft hangen
  };
  return { synthBodies, fetchImpl };
}

// Bouw een gefakede browser-API; met storageDelay blijft settings.load()
// hangen tot de test _resolveGet() aanroept (om de I2-race te sturen).
function makeBrowser({ storageDelay = false, stored = {} } = {}) {
  const b = { sent: [], _resolveGet: null };
  b.storage = {
    local: {
      get: () => (storageDelay
        ? new Promise((resolve) => { b._resolveGet = () => resolve(stored); })
        : Promise.resolve(stored)),
      set: () => Promise.resolve(),
    },
  };
  b.tabs = {
    sendMessage: (tabId, msg) => { b.sent.push({ tabId, msg }); return Promise.resolve(); },
    query: () => Promise.resolve([]),
    onRemoved: { addListener: (fn) => { b.onRemoved = fn; } },
    onUpdated: { addListener: (fn) => { b.onUpdated = fn; } },
  };
  b.browserAction = { onClicked: { addListener: () => {} } };
  b.commands = { onCommand: { addListener: () => {} } };
  b.runtime = { onMessage: { addListener: (fn) => { b.onMessage = fn; } } };
  return b;
}

const SENTENCES = [{ id: 0, text: 'Hallo wereld.' }, { id: 1, text: 'Tweede zin.' }];
const startMsg = { type: MSG.START, sentences: SENTENCES, lang: 'nl' };

const eventsTo = (b, tabId) => b.sent
  .filter((m) => m.tabId === tabId && m.msg.type === MSG.EVENT)
  .map((m) => m.msg.event);
// Macrotask-tick: laat alle aangegane microtasks (settings.load, health e.d.) afronden.
const tick = async () => { await new Promise((r) => setTimeout(r, 0)); };

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = realFetch; });

describe('background sessie-levenscyclus', () => {
  it('I1: sluiten van de actieve tab stopt de player', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch().fetchImpl;
    // Vaste import-query per test voor geïsoleerde module-state.
    await import('../extension/background/background.js?case=lc-i1a');
    b.onMessage(startMsg, { tab: { id: 1 } });
    await tick();
    expect(eventsTo(b, 1).some((e) => e.type === 'init')).toBe(true);

    b.onRemoved(1);
    // player.stop() rapporteert state idle ...
    expect(eventsTo(b, 1).some((e) => e.type === 'state' && e.state === 'idle')).toBe(true);

    // ... en de sessie is weg: een START elders stuurt geen takeover naar tab 1.
    b.sent.length = 0;
    b.onMessage(startMsg, { tab: { id: 2 } });
    await tick();
    expect(b.sent.some((m) => m.tabId === 1)).toBe(false);
    expect(eventsTo(b, 2).some((e) => e.type === 'init')).toBe(true);
  });

  it('I1: navigatie van de actieve tab stopt de player; andere tabs niet', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch().fetchImpl;
    await import('../extension/background/background.js?case=lc-i1b');
    b.onMessage(startMsg, { tab: { id: 1 } });
    await tick();

    b.onUpdated(9, { url: 'https://example.com/elders' }); // andere tab: geen effect
    expect(eventsTo(b, 1).some((e) => e.type === 'state' && e.state === 'idle')).toBe(false);

    b.onUpdated(1, {}); // geen url-wijziging (bv. titel/favicon): geen effect
    expect(eventsTo(b, 1).some((e) => e.type === 'state' && e.state === 'idle')).toBe(false);

    b.onUpdated(1, { url: 'https://example.com/andere-pagina' });
    expect(eventsTo(b, 1).some((e) => e.type === 'state' && e.state === 'idle')).toBe(true);
  });

  it('I2: STOP tijdens een lopende START (settings laden) wordt niet gedropt', async () => {
    const b = makeBrowser({ storageDelay: true });
    globalThis.browser = b;
    globalThis.fetch = makeFetch().fetchImpl;
    await import('../extension/background/background.js?case=lc-i2');
    b.onMessage(startMsg, { tab: { id: 1 } });
    // settings.load() hangt nog; gebruiker drukt opnieuw Alt+R → STOP.
    b.onMessage({ type: MSG.CONTROL, action: CONTROL.STOP }, { tab: { id: 1 } });
    b._resolveGet();
    await tick();

    // De START mag niet meer doorzetten: geen init-event, geen afspraak met de player.
    expect(eventsTo(b, 1).some((e) => e.type === 'init')).toBe(false);
    // De sessie is beëindigd: een START elders stuurt geen takeover naar tab 1.
    b.onMessage(startMsg, { tab: { id: 2 } });
    await tick();
    expect(b.sent.some((m) => m.tabId === 1)).toBe(false);
  });

  it('I3: START in tweede tab ruimt de eerste op; verlate STOP van de oude tab wordt genegeerd', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch().fetchImpl;
    await import('../extension/background/background.js?case=lc-i3');
    b.onMessage(startMsg, { tab: { id: 1 } });
    await tick();
    expect(eventsTo(b, 1).some((e) => e.type === 'init')).toBe(true);

    b.onMessage(startMsg, { tab: { id: 2 } });
    // Tab 1 krijgt een takeover-event zodat die playerbar en highlights opruimt.
    expect(eventsTo(b, 1).some((e) => e.type === 'taken-over')).toBe(true);
    await tick();
    expect(eventsTo(b, 2).some((e) => e.type === 'init')).toBe(true);

    // Een verlate STOP van tab 1 mag de sessie van tab 2 niet raken ...
    b.sent.length = 0;
    b.onMessage({ type: MSG.CONTROL, action: CONTROL.STOP }, { tab: { id: 1 } });
    expect(eventsTo(b, 2).some((e) => e.type === 'state' && e.state === 'idle')).toBe(false);

    // ... maar een STOP van tab 2 stopt zijn eigen sessie wél.
    b.onMessage({ type: MSG.CONTROL, action: CONTROL.STOP }, { tab: { id: 2 } });
    expect(eventsTo(b, 2).some((e) => e.type === 'state' && e.state === 'idle')).toBe(true);
  });

  it('helper offline bij START stuurt een helper-offline error-event naar de tab', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch({ health: null }).fetchImpl;
    await import('../extension/background/background.js?case=lc-offline');
    b.onMessage(startMsg, { tab: { id: 1 } });
    await tick();

    expect(eventsTo(b, 1).some((e) => e.type === 'error' && e.message === 'helper-offline')).toBe(true);
    // De player is niet gestart: geen state-events.
    expect(eventsTo(b, 1).some((e) => e.type === 'state')).toBe(false);
  });

  it('piper-engine gebruikt de vaste piper-stem; edge gebruikt resolveVoice', async () => {
    // enginePref 'local' + piper aanwezig → vaste piper-stem.
    const b = makeBrowser({ stored: { enginePref: 'local' } });
    globalThis.browser = b;
    const piper = makeFetch();
    globalThis.fetch = piper.fetchImpl;
    await import('../extension/background/background.js?case=lc-voice-piper');
    b.onMessage(startMsg, { tab: { id: 1 } });
    await tick();
    expect(piper.synthBodies[0]).toMatchObject({ engine: 'piper', voice: 'nl_NL-mls-medium' });

    // enginePref 'cloud' → edge-stem uit resolveVoice (eerste nl-stem).
    const b2 = makeBrowser();
    globalThis.browser = b2;
    const edge = makeFetch();
    globalThis.fetch = edge.fetchImpl;
    await import('../extension/background/background.js?case=lc-voice-edge');
    b2.onMessage(startMsg, { tab: { id: 1 } });
    await tick();
    expect(edge.synthBodies[0]).toMatchObject({ engine: 'edge', voice: 'nl-NL-FennaNeural' });
  });
});
