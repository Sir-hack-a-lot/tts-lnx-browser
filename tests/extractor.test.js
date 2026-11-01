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
    });    expect(second[0].start).toBeGreaterThan(first[0].start);
  });

  it('geeft null als de zin er niet is', () => {
    expect(locateSentence(document, 'Deze zin bestaat niet.')).toBeNull();
  });
});

// Regressie: de haystack voegde tekstnodes altijd samen MET spatie, maar
// textContent (waar de zinnen vandaan komen) plakt zonder spatie. Zinnen met
// een node-grens zonder witruimte — zoals een link direct achter een woord —
// werden daardoor nooit gevonden (gemiste markering, "slaat stukken over").
describe('locateSentence node-grenzen', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body>'
      + '<p>In een nieuwe update<a href="#">(opent in nieuw venster)</a> stelt Binance dat het klopt.</p>'
      + '<p>Tekst <b>vet</b><a href="#">(link)</a> erachter.</p>'
      + '<p>Woord <b>extra</b>\n   <span>(haakje)</span> met witruimte-node.</p>'
      + '</body>';
  });

  const found = (t) => locateSentence(document, t)?.map(
    ({ node, start, end }) => node.nodeValue.slice(start, end),
  ).join(' ');

  it('vindt een zin met een link zonder spatie ervoor (update(opent...)', () => {
    expect(found('In een nieuwe update(opent in nieuw venster) stelt Binance dat het klopt.'))
      .toBe('In een nieuwe update (opent in nieuw venster) stelt Binance dat het klopt.');
  });

  it('handhaaft spatie vóór vet én geen spatie vóór de link in één zin', () => {
    expect(found('Tekst vet(link) erachter.')).toBe('Tekst vet (link) erachter.');
  });

  it('telt een witruimte-node als grens-witruimte', () => {
    expect(found('Woord extra (haakje) met witruimte-node.')).toBe('Woord extra (haakje) met witruimte-node.');
  });

  it('valt terug op zoeken vanaf het begin als het voorwaartse venster faalt', () => {
    // fromNode ligt ná de gezochte tekst: voorwaarts zoeken faalt, de
    // fallback vanaf documentbegin vindt hem alsnog.
    const late = locateSentence(document, 'Woord extra (haakje) met witruimte-node.');
    const retry = locateSentence(document, 'Tekst vet(link) erachter.', {
      fromNode: late[late.length - 1].node,
      fromOffset: late[late.length - 1].end,
    });
    expect(retry).not.toBeNull();
    expect(retry[0].node.nodeValue.slice(retry[0].start, retry[0].end)).toBe('Tekst');
  });

  it('vindt een zin waar Readability witruimte uit liet vallen (NOS-kop)', () => {
    // In de DOM staat "NOS Nieuws" + " " + "gisteren, 21:33", maar de
    // geëxtraheerde zin is "NOS Nieuwsgisteren, 21:33" (zonder spatie).
    // Pass 2 (spatie-ongevoelig) dekt dit omgekeerde witruimte-verschil.
    document.documentElement.innerHTML = '<head></head><body>'
      + '<p><span>NOS Nieuws</span> <time>gisteren, 21:33</time></p>'
      + '<p>Het oorlogsmonument is met verf besmeurd.</p></body>';
    const segs = locateSentence(document, 'NOS Nieuwsgisteren, 21:33');
    expect(segs).not.toBeNull();
    const text = segs.map(({ node, start, end }) => node.nodeValue.slice(start, end)).join(' ');
    expect(text).toBe('NOS Nieuws gisteren, 21:33');
  });
});
