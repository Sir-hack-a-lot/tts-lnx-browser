// Contextmenu "Lees selectie voor": background maakt het item aan en stuurt
// bij klik READ_SELECTION naar de tab.
import { describe, it, expect } from 'vitest';
import { MSG } from '../extension/shared/messages.js';

function makeBrowser() {
  const b = { sent: [], created: [] };
  b.storage = { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } };
  b.tabs = {
    sendMessage: (tabId, msg) => { b.sent.push({ tabId, msg }); return Promise.resolve(); },
    query: () => Promise.resolve([]),
    onRemoved: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
  };
  b.browserAction = { onClicked: { addListener: () => {} } };
  b.commands = { onCommand: { addListener: () => {} } };
  b.runtime = {
    getURL: (p) => `moz-extension://abc/${p}`,
    sendMessage: () => Promise.resolve(),
    onMessage: { addListener: () => {} },
  };
  b.i18n = { getMessage: (key) => `t:${key}` };
  b.contextMenus = {
    create: (opts) => b.created.push(opts),
    onClicked: { addListener: (fn) => { b.menuClicked = fn; } },
  };
  return b;
}

describe('contextmenu lees selectie', () => {
  it('maakt een menu-item aan dat alleen bij een selectie zichtbaar is', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    await import('../extension/background/background.js?case=ctx-create');
    expect(b.created).toHaveLength(1);
    expect(b.created[0].contexts).toEqual(['selection']);
    expect(b.created[0].title).toBe('t:contextMenuReadSelection');
  });

  it('stuurt READ_SELECTION naar de tab bij klik op het menu-item', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    await import('../extension/background/background.js?case=ctx-click');
    b.menuClicked({ menuItemId: b.created[0].id }, { id: 7 });
    expect(b.sent).toContainEqual({ tabId: 7, msg: { type: MSG.READ_SELECTION } });
  });

  it('negeert klikken op andere menu-items', async () => {
    const b = makeBrowser();
    globalThis.browser = b;
    await import('../extension/background/background.js?case=ctx-other');
    b.menuClicked({ menuItemId: 'iets-anders' }, { id: 7 });
    expect(b.sent).toHaveLength(0);
  });
});
