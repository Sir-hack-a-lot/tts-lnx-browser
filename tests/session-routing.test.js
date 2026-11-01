// Tests voor de toTab-filter in de gedeelde sessie: extension-pagina's
// (PDF-viewer) krijgen berichten via runtime.sendMessage en moeten alleen
// reageren op berichten voor hun eigen tab.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { MSG } from '../extension/shared/messages.js';
import { attachReader } from '../extension/content/session.js';
import { i18nMock } from './helpers/i18n.js';

const SENTENCES = [{ id: 0, text: 'Hallo wereld.' }];

function setup(tabId) {
  document.body.innerHTML = '<main><p>Hallo wereld.</p></main>';
  const sent = [];
  let listener = null;
  globalThis.browser = {
    i18n: i18nMock(),
    runtime: {
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendMessage: (m) => { sent.push(m); return Promise.resolve(); },
    },
  };
  attachReader(document, {
    extract: () => SENTENCES,
    detectLang: () => 'nl',
    routedTabId: tabId,
  });
  return { sent, getListener: () => listener };
}

describe('sessie toTab-filter (viewer)', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });

  it('stuurt het eigen tab-id mee met uitgaande berichten', () => {
    const { sent, getListener } = setup(8);
    getListener()({ type: MSG.TOGGLE, toTab: 8 });
    const start = sent.find((m) => m.type === MSG.START);
    expect(start?.tabId).toBe(8);
  });

  it('negeert berichten voor een andere tab', () => {
    const { sent, getListener } = setup(8);
    getListener()({ type: MSG.TOGGLE, toTab: 9 });
    expect(sent).toHaveLength(0);
  });

  it('negeert berichten zonder toTab (die zijn voor content scripts)', () => {
    const { sent, getListener } = setup(8);
    getListener()({ type: MSG.TOGGLE });
    expect(sent).toHaveLength(0);
  });

  it('reageert op events voor de eigen tab (zinmarkering)', () => {
    const { sent, getListener } = setup(8);
    getListener()({ type: MSG.TOGGLE, toTab: 8 });
    getListener()({ type: MSG.EVENT, event: { type: 'sentence-start', index: 0 }, toTab: 8 });
    expect(document.querySelector('.tts-sentence')).not.toBeNull();
    getListener()({ type: MSG.EVENT, event: { type: 'end' }, toTab: 8 });
    expect(sent.some((m) => m.type === MSG.START)).toBe(true);
  });
});
