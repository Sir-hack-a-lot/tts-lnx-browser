// Tests voor de viewer-tab-routing in de background: een extension-pagina
// (PDF-viewer) is geen content script, dus berichten lopen via
// runtime.sendMessage met toTab-filter in plaats van tabs.sendMessage.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MSG, CONTROL } from '../extension/shared/messages.js';

const VIEWER_URL = 'moz-extension://abc/viewer/viewer.html';

function makeFetch() {
  return (url, opts) => {
    if (url.endsWith('/health')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok', engines: { edge: true, piper: true } }),
      });
    }
    return new Promise(() => {}); // synthesize blijft hangen
  };
}

function makeBrowser() {
  const b = { tabsSent: [], runtimeSent: [] };
  b.storage = { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } };
  b.tabs = {
    sendMessage: (tabId, msg) => { b.tabsSent.push({ tabId, msg }); return Promise.resolve(); },
    query: () => Promise.resolve([]),
    onRemoved: { addListener: (fn) => { b.onRemoved = fn; } },
    onUpdated: { addListener: (fn) => { b.onUpdated = fn; } },
  };
  b.browserAction = { onClicked: { addListener: () => {} } };
  b.commands = { onCommand: { addListener: () => {} } };
  b.runtime = {
    getURL: (p) => `moz-extension://abc/${p}`,
    sendMessage: (msg) => { b.runtimeSent.push(msg); return Promise.resolve(); },
    onMessage: { addListener: (fn) => { b.onMessage = fn; } },
  };
  return b;
}

const SENTENCES = [{ id: 0, text: 'Eerste zin.' }, { id: 1, text: 'Tweede zin.' }];
const tick = async () => { await new Promise((r) => setTimeout(r, 0)); };

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = realFetch; });

describe('viewer-tab-routing', () => {
  it('registreert een viewer-tab via VIEWER_HELLO en routeert events via runtime', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch();
    await import('../extension/background/background.js?case=vr-hello');

    // Alleen de eigen viewer-url mag zich registreren.
    b.onMessage({ type: MSG.VIEWER_HELLO, tabId: 7 }, { url: 'https:// kwaad.nl/pagina' });
    b.onMessage({ type: MSG.VIEWER_HELLO, tabId: 8 }, { url: `${VIEWER_URL}?src=x` });

    // START van de viewer-tab: geen sender.tab, wel het geregistreerde tabId.
    b.onMessage(
      { type: MSG.START, sentences: SENTENCES, lang: 'nl', tabId: 8 },
      { url: `${VIEWER_URL}?src=x` },
    );
    await tick();

    // Events gaan via runtime.sendMessage met toTab, niet via tabs.sendMessage.
    const inits = b.runtimeSent.filter(
      (m) => m.type === MSG.EVENT && m.event.type === 'init' && m.toTab === 8,
    );
    expect(inits).toHaveLength(1);
    expect(b.tabsSent.filter((m) => m.tabId === 8)).toHaveLength(0);

    // De kwaadaardige tab 7 werd niet geregistreerd: geen routing naar 7.
    expect(b.runtimeSent.some((m) => m.toTab === 7)).toBe(false);
  });

  it('START met tabId van een niet-geregistreerde tab wordt genegeerd', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch();
    await import('../extension/background/background.js?case=vr-unknown');
    b.onMessage({ type: MSG.START, sentences: SENTENCES, lang: 'nl', tabId: 99 }, { url: VIEWER_URL });
    await tick();
    expect(b.runtimeSent).toHaveLength(0);
    expect(b.tabsSent).toHaveLength(0);
  });

  it('CONTROL van de viewer-tab stuurt de player; sluiten van de tab wist de registratie', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch();
    await import('../extension/background/background.js?case=vr-control');
    b.onMessage({ type: MSG.VIEWER_HELLO, tabId: 8 }, { url: VIEWER_URL });
    b.onMessage(
      { type: MSG.START, sentences: SENTENCES, lang: 'nl', tabId: 8 },
      { url: VIEWER_URL },
    );
    await tick();

    // STOP van de viewer wordt geaccepteerd (geen sender.tab nodig).
    b.onMessage({ type: MSG.CONTROL, action: CONTROL.STOP, tabId: 8 }, { url: VIEWER_URL });
    expect(b.runtimeSent.some((m) => m.event?.type === 'state' && m.event?.state === 'idle')).toBe(true);

    // Na het sluiten van de tab is de registratie weg.
    b.onRemoved(8);
    b.runtimeSent.length = 0;
    b.onMessage(
      { type: MSG.START, sentences: SENTENCES, lang: 'nl', tabId: 8 },
      { url: VIEWER_URL },
    );
    await tick();
    expect(b.runtimeSent).toHaveLength(0);
  });

  it('gewone content-scripts gebruiken ongewijzigd tabs.sendMessage', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    globalThis.fetch = makeFetch();
    await import('../extension/background/background.js?case=vr-content');
    b.onMessage({ type: MSG.START, sentences: SENTENCES, lang: 'nl' }, { tab: { id: 3 } });
    await tick();
    expect(b.tabsSent.some((m) => m.tabId === 3 && m.msg.type === MSG.EVENT)).toBe(true);
    expect(b.runtimeSent).toHaveLength(0);
  });
});
