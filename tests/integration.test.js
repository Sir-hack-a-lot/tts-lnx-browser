// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { MSG, CONTROL } from '../extension/shared/messages.js';
import { i18nMock } from './helpers/i18n.js';

describe('content-flow (integratie)', () => {
  let sent;
  let listener;

  // content.js-module is per testbestand gecachet (vaste import-query); module-state
  // (o.a. `active`) deelt over tests. Ruim daarom na elke test expliciet op:
  // een 'end'-event buiten actieve toestand is een no-op.
  afterEach(() => {
    listener?.({ type: MSG.EVENT, event: { type: 'end' } });
  });

  beforeEach(async () => {
    document.documentElement.lang = 'nl'; // innerHTML-veeg laat attributen van <html> ongemoeid
    // jsdom kent scrollIntoView niet; content.js roept het aan bij meescrollen.
    Element.prototype.scrollIntoView = () => {};
    document.documentElement.innerHTML = readFileSync('tests/fixtures/article.html', 'utf8')
      .replace(/[\s\S]*<html[^>]*>/, '').replace(/<\/html>[\s\S]*/, '');
    sent = [];
    globalThis.browser = {
      i18n: i18nMock(),
      runtime: {
        onMessage: { addListener: (fn) => { listener = fn; } },
        sendMessage: (m) => { sent.push(m); return Promise.resolve(); },
      },
    };
    // Vers importeren per test zodat module-state niet lekt tussen tests.
    // Let op: vite weigert VARIABELE dynamic imports — gebruik een vaste query-string
    // per testbestand; module-state resetten gebeurt via de beforeEach-DOM-reset en
    // de TOGGLE/stop-flow zelf (zie tests/content-seek.test.js voor het patroon).
    await import('../extension/content/content.js?case=integration');
  });

  it('stuurt START met zinnen en taal bij TOGGLE', () => {
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    expect(start).toBeTruthy();
    expect(start.sentences.length).toBeGreaterThanOrEqual(4);
    expect(start.sentences.map((s) => s.text)).toContain('De kat zat op de mat.');
    expect(start.lang).toBe('nl'); // uit lang-attribuut van de fixture
    expect(document.getElementById('tts-lnx-playerbar')).not.toBeNull();
  });

  it('highlight zin en woord bij playerevents', () => {
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    const idx = start.sentences.findIndex((s) => s.text === 'De kat zat op de mat.');
    listener({ type: MSG.EVENT, event: {
      type: 'sentence-start', index: idx,
      boundaries: [
        { text: 'De', offsetMs: 0, durationMs: 100 },
        { text: 'kat', offsetMs: 100, durationMs: 200 },
        { text: 'zat', offsetMs: 300, durationMs: 200 },
      ],
    }});
    expect(document.querySelector('.tts-sentence')?.textContent).toBe('De kat zat op de mat.');
    listener({ type: MSG.EVENT, event: { type: 'progress', index: idx, elapsedMs: 150 } });
    expect(document.querySelector('.tts-word')?.textContent).toBe('kat');
  });

  it('ruimt alles op bij end', () => {
    const before = document.body.innerHTML;
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    listener({ type: MSG.EVENT, event: { type: 'sentence-start', index: 0, boundaries: [] } });
    expect(document.querySelector('.tts-sentence')).not.toBeNull();
    listener({ type: MSG.EVENT, event: { type: 'end' } });
    expect(document.querySelector('.tts-sentence')).toBeNull();
    expect(document.getElementById('tts-lnx-playerbar')).toBeNull();
    expect(document.body.innerHTML).toBe(before);
  });

  it('ruimt alles op bij taken-over (sessie overgenomen door andere tab)', () => {
    listener({ type: MSG.TOGGLE });
    listener({ type: MSG.EVENT, event: { type: 'sentence-start', index: 0, boundaries: [] } });
    expect(document.querySelector('.tts-sentence')).not.toBeNull();
    sent.length = 0;
    listener({ type: MSG.EVENT, event: { type: 'taken-over' } });
    expect(document.querySelector('.tts-sentence')).toBeNull();
    expect(document.getElementById('tts-lnx-playerbar')).toBeNull();
    // Geen STOP terug naar de achtergrond: die zou de nieuwe sessie raken.
    expect(sent.some((m) => m.type === MSG.CONTROL)).toBe(false);
  });

  it('toont installatie-instructie bij helper-offline en ruimt op', () => {
    listener({ type: MSG.TOGGLE });
    expect(document.getElementById('tts-lnx-playerbar')).not.toBeNull();
    listener({ type: MSG.EVENT, event: { type: 'error', message: 'helper-offline' } });
    expect(document.body.textContent)
      .toContain("Helper is not running. Install with: pipx install './helper[piper]' (see README)");
    expect(document.getElementById('tts-lnx-playerbar')).toBeNull();
  });

  it('stuurt SEEK bij klik op een alinea', () => {
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    const target = start.sentences.find((s) => s.text.includes('De muis rende'));
    const p = [...document.querySelectorAll('p')].find((el) => el.textContent.includes('De muis rende'));
    p.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sent).toContainEqual({ type: MSG.CONTROL, action: CONTROL.SEEK, value: target.id });
  });

  it('TOGGLE tijdens afspelen stopt en ruimt op', () => {
    listener({ type: MSG.TOGGLE });
    sent.length = 0;
    listener({ type: MSG.TOGGLE });
    expect(sent).toContainEqual({ type: MSG.CONTROL, action: CONTROL.STOP, value: undefined });
    expect(document.getElementById('tts-lnx-playerbar')).toBeNull();
  });

  it('leest alleen de selectie voor bij READ_SELECTION (rechtermuisknop)', () => {
    // Selecteer de tweede alinea ("De muis rende hard weg. De kat bleef zitten.").
    const p = [...document.querySelectorAll('p')].find((el) => el.textContent.includes('De muis rende'));
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    listener({ type: MSG.READ_SELECTION });
    const start = sent.find((m) => m.type === MSG.START);
    expect(start).toBeTruthy();
    expect(start.sentences.map((s) => s.text))
      .toEqual(['De muis rende hard weg.', 'De kat bleef zitten.']);
    expect(document.getElementById('tts-lnx-playerbar')).not.toBeNull();
    sel.removeAllRanges();
  });

  it('stopt een lopende sessie voordat de selectie-voorlezing start', () => {
    listener({ type: MSG.TOGGLE }); // start hele artikel
    const p = [...document.querySelectorAll('p')].find((el) => el.textContent.includes('Herhaling'));
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    sent.length = 0;
    listener({ type: MSG.READ_SELECTION });
    expect(sent[0]).toEqual({ type: MSG.CONTROL, action: CONTROL.STOP, value: undefined });
    const start = sent.find((m) => m.type === MSG.START);
    expect(start.sentences.map((s) => s.text)).toEqual(['Herhaling komt voor.', 'Herhaling komt voor.']);
    sel.removeAllRanges();
  });

  it('doet niets bij READ_SELECTION zonder selectie', () => {
    listener({ type: MSG.READ_SELECTION });
    expect(sent).toHaveLength(0);
    expect(document.getElementById('tts-lnx-playerbar')).toBeNull();
  });
});
