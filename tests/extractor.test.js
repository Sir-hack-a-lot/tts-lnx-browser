// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractArticle, locateSentence } from '../extension/content/extractor.js';

function loadFixture() {
  document.documentElement.innerHTML = readFileSync('tests/fixtures/article.html', 'utf8')
    .replace(/[\s\S]*<html[^>]*>/, '').replace(/<\/html>[\s\S]*/, '');
  return document;
}

describe('extractArticle', () => {
  beforeEach(() => loadFixture());

  it('extraheert zinnen uit het artikel, zonder nav en footer', () => {
    const { title, sentences } = extractArticle(document);
    const texts = sentences.map((s) => s.text);
    expect(texts).toContain('De kat zat op de mat.');
    expect(texts).toContain('De muis rende hard weg.');
    expect(texts.some((t) => t.includes('Menu item'))).toBe(false);
    expect(texts.some((t) => t.includes('Copyright'))).toBe(false);
    expect(title).toBeTruthy();
    // id's lopen op vanaf 0
    expect(sentences[0].id).toBe(0);
    expect(sentences[1].id).toBe(1);
  });

  it('valt terug op bodytekst als Readability niets vindt', () => {
    document.documentElement.innerHTML = '<head><title>leeg</title></head><body><p>Korte tekst.</p></body>';
    const { sentences } = extractArticle(document);
    // Readability kan hier null geven; in dat geval levert de fallback 'Korte tekst.'
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.some((s) => s.text.includes('Korte tekst.'))).toBe(true);
  });
});

describe('locateSentence', () => {
  beforeEach(() => loadFixture());

  it('vindt een zin in één tekstnode', () => {
    const segs = locateSentence(document, 'De kat zat op de mat.');
    expect(segs).not.toBeNull();
    const { node, start, end } = segs[0];
    expect(node.nodeValue.slice(start, end)).toBe('De kat zat op de mat.');
  });

  it('vindt een zin die over inline elementen heen loopt', () => {
    const segs = locateSentence(document, 'De muis rende hard weg.');
    expect(segs).not.toBeNull();
    expect(segs.length).toBeGreaterThanOrEqual(2); // tekst vóór en in <b>
    const joined = segs.map(({ node, start, end }) => node.nodeValue.slice(start, end)).join(' ');
    expect(joined).toBe('De muis rende hard weg.');
  });

  it('respecteert fromNode/fromOffset bij herhaalde zinnen', () => {
    const first = locateSentence(document, 'Herhaling komt voor.');
    const second = locateSentence(document, 'Herhaling komt voor.', {
      fromNode: first[0].node,
      fromOffset: first[0].end,
    });
    expect(second[0].start).toBeGreaterThan(first[0].start);
  });

  it('geeft null als de zin er niet is', () => {
    expect(locateSentence(document, 'Deze zin bestaat niet.')).toBeNull();
  });
});
