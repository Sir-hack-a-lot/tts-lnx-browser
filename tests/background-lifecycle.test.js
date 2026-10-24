// Unit-tests voor de sessie-levenscyclus van de background-router:
// I1 (tab sluiten/navigeren stopt de player), I2 (STOP tijdens lopende START
// wordt niet gedropt) en I3 (sessie-overname ruimt de oude tab op en isoleert
// haar CONTROL-berichten).
import { describe, it, expect, beforeAll } from 'vitest';
import { MSG, CONTROL } from '../extension/shared/messages.js';

// Fake WebSocket: synthese blijft bewust pending, zodat de player in
// 'loading' blijft zonder netwerkverkeer. send() is een no-op: zonder die
// gooit de executor en hangt de testuitslag af van crypto-timing (flake).
class FakeWebSocket {
  constructor() {}
  set binaryType(v) {}
  send() {}
  close() {}
}

// Bouw een gefakede browser-API; met storageDelay blijft settings.load()
// hangen tot de test _resolveGet() aanroept (om de I2-race te sturen).
function makeBrowser({ storageDelay = false } = {}) {
  const b = { sent: [], _resolveGet: null };
  b.storage = {
    local: {
      get: () => (storageDelay
        ? new Promise((resolve) => { b._resolveGet = () => resolve({}); })
        : Promise.resolve({})),
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
  b.webRequest = { onBeforeSendHeaders: { addListener: (fn) => { b.onBeforeSendHeaders = fn; } } };
  return b;
}

const SENTENCES = [{ id: 0, text: 'Hallo wereld.' }, { id: 1, text: 'Tweede zin.' }];
const startMsg = { type: MSG.START, sentences: SENTENCES, lang: 'nl' };

const eventsTo = (b, tabId) => b.sent
  .filter((m) => m.tabId === tabId && m.msg.type === MSG.EVENT)
  .map((m) => m.msg.event);
// Macrotask-tick: laat alle aangegane microtasks (settings.load e.d.) afronden.
const tick = async () => { await new Promise((r) => setTimeout(r, 0)); };

beforeAll(() => {
  globalThis.WebSocket = FakeWebSocket;
});

describe('background sessie-levenscyclus', () => {
  it('I1: sluiten van de actieve tab stopt de player', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
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

  it('herschrijft de User-Agent naar Edge voor de TTS-host (dienst eist dat)', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    await import('../extension/background/background.js?case=lc-ua');
    const result = b.onBeforeSendHeaders({
      requestHeaders: [
        { name: 'User-Agent', value: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0' },
        { name: 'Accept', value: '*/*' },
      ],
    });
    const ua = result.requestHeaders.find((h) => h.name.toLowerCase() === 'user-agent');
    expect(ua.value).toContain('Edg/');
    expect(result.requestHeaders.find((h) => h.name === 'Accept').value).toBe('*/*');
  });
});
