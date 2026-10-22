// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHighlighter, HIGHLIGHT_CSS } from '../extension/content/highlighter.js';
import { locateSentence } from '../extension/content/extractor.js';

beforeEach(() => {
  document.documentElement.innerHTML = readFileSync('tests/fixtures/article.html', 'utf8')
    .replace(/[\s\S]*<html[^>]*>/, '').replace(/<\/html>[\s\S]*/, '');
});

describe('createHighlighter', () => {
  it('highlight een zin en herstelt de DOM bij clear()', () => {
    const before = document.body.innerHTML;
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De kat zat op de mat.'));
    expect(document.querySelector('.tts-sentence').textContent).toBe('De kat zat op de mat.');
    h.clear();
    expect(document.body.innerHTML).toBe(before);
  });

  it('highlight opeenvolgende woorden binnen de zin', () => {
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De kat zat op de mat.'));
    let pos = h.highlightWord('kat', 0);
    expect(pos).toBeGreaterThan(0);
    expect(document.querySelector('.tts-word').textContent).toBe('kat');
    pos = h.highlightWord('mat', pos);
    expect(document.querySelectorAll('.tts-word')).toHaveLength(1); // vorige woord-highlight weg
    expect(document.querySelector('.tts-word').textContent).toBe('mat');
    expect(document.querySelector('.tts-sentence')).not.toBeNull(); // zin blijft staan
  });

  it('highlight een woord in een inline element', () => {
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De muis rende hard weg.'));
    h.highlightWord('hard', 0);
    expect(document.querySelector('.tts-word').textContent).toBe('hard');
  });

  it('geeft fromPos terug als het woord er niet is', () => {
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De kat zat op de mat.'));
    expect(h.highlightWord('aardvarken', 4)).toBe(4);
  });

  it('bevat CSS voor beide highlight-niveaus', () => {
    expect(HIGHLIGHT_CSS).toContain('.tts-sentence');
    expect(HIGHLIGHT_CSS).toContain('.tts-word');
  });
});
