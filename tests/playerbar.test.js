// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createPlayerBar } from '../extension/content/playerbar.js';
import { CONTROL } from '../extension/shared/messages.js';
import { i18nMock } from './helpers/i18n.js';

beforeEach(() => {
  globalThis.browser = { i18n: i18nMock() };
});

function makeBar() {
  const calls = [];
  const bar = createPlayerBar(document, { onControl: (a, v) => calls.push([a, v]) });
  document.body.appendChild(bar.el);
  return { calls, bar };
}
// Closed shadow DOM: el.shadowRoot is null; tests gebruiken de interne _shadow.
function clickButton(bar, action) {
  bar._shadow.querySelector(`[data-a="${action}"]`)?.dispatchEvent(new Event('click', { bubbles: true }));
}

describe('createPlayerBar', () => {
  it('stuurt pause en daarna resume bij klik op de pause-knop', () => {
    const { calls, bar } = makeBar();
    clickButton(bar, 'pause');
    expect(calls).toContainEqual([CONTROL.PAUSE, undefined]);
    bar.setPlaying(false);
    clickButton(bar, 'pause');
    expect(calls).toContainEqual([CONTROL.RESUME, undefined]);
  });

  it('stuurt next/prev/stop', () => {
    const { calls, bar } = makeBar();
    clickButton(bar, 'next');
    clickButton(bar, 'prev');
    clickButton(bar, 'stop');
    expect(calls.map(([a]) => a)).toEqual([CONTROL.NEXT, CONTROL.PREV, CONTROL.STOP]);
  });

  it('stuurt rate bij wijzigen van de select', () => {
    const { calls, bar } = makeBar();
    const select = bar._shadow.querySelector('select[data-a="rate"]');
    if (select) {
      select.value = '1.5';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(calls).toContainEqual([CONTROL.RATE, 1.5]);
    } else {
      throw new Error('rate-select niet gevonden in shadow DOM');
    }
  });

  it('setRate() zet de select-waarde', () => {
    const { bar } = makeBar();
    bar.setRate(1.5);
    expect(bar._shadow.querySelector('select[data-a="rate"]').value).toBe('1.5');
  });

  it('setEngine() zet icoon en tooltip: wolkje = cloud, huisje = lokaal', () => {
    const { bar } = makeBar();
    const engineEl = bar._shadow.querySelector('.engine');
    bar.setEngine('piper');
    expect(engineEl.textContent).toBe('🏠');
    expect(engineEl.title).toContain('local');
    expect(engineEl.title).toContain('Piper');
    bar.setEngine('edge');
    expect(engineEl.textContent).toBe('☁');
    expect(engineEl.title).toContain('cloud');
    expect(engineEl.title).toContain('Edge TTS');
  });

  it('destroy() verwijdert de balk uit het document', () => {
    const { bar } = makeBar();
    bar.destroy();
    expect(document.body.contains(bar.el)).toBe(false);
  });
});
