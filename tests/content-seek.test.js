// @vitest-environment jsdom
// Regressietest: na een seek ACHTERUIT (klik op een eerdere alinea) moet de
// highlight opnieuw gezet worden — de voorwaartse zoekpointer van
// locateSentence wordt bij een sprong gereset.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { MSG } from '../extension/shared/messages.js';

let listener; // door content.js geregistreerde onMessage-handler
const sent = []; // door content.js verstuurde berichten

beforeAll(async () => {
  globalThis.browser = {
    runtime: {
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendMessage: (msg) => { sent.push(msg); return Promise.resolve(); },
    },
  };
  // jsdom kent scrollIntoView niet; content.js roept het aan bij meescrollen.
  Element.prototype.scrollIntoView = () => {};

  document.documentElement.innerHTML = readFileSync('tests/fixtures/article.html', 'utf8')
    .replace(/[\s\S]*<html[^>]*>/, '').replace(/<\/html>[\s\S]*/, '');
  document.documentElement.lang = 'nl';

  // Vers importeren (query maakt het een aparte module-instantie) zodat de
  // listener op onze fake browser landt — na het neerzetten van de mock.
  await import('../extension/content/content.js?case=seek-test');
});

// Zet de content-module in een schone actieve toestand en geef de zinnen terug.
function restart() {
  sent.length = 0;
  listener({ type: MSG.TOGGLE }); // start als inactief, stop als actief
  let start = sent.find((m) => m.type === MSG.START);
  if (!start) { // we waren actief en hebben nu gestopt → opnieuw starten
    listener({ type: MSG.TOGGLE });
    start = sent.find((m) => m.type === MSG.START);
  }
  expect(start).toBeTruthy();
  return start.sentences;
}

function sentenceStart(index) {
  listener({ type: MSG.EVENT, event: { type: 'sentence-start', index, boundaries: [] } });
}

describe('content.js seek-gedrag', () => {
  it('highlight een unieke eerdere zin opnieuw na een seek achteruit', () => {
    const sentences = restart();
    // Sprong vooruit naar een late zin, dan terug naar een unieke eerdere zin.
    // Zonder pointer-reset zoekt locateSentence vanaf een punt ná de doelzin
    // en vindt hij niets: de highlight bleef dan uit.
    const late = sentences.find((s) => s.text === 'De kat bleef zitten.').id;
    const early = sentences.find((s) => s.text === 'De kat zat op de mat.').id;
    expect(early).toBeLessThan(late);

    sentenceStart(late);
    expect(document.querySelector('.tts-sentence')?.textContent).toBe('De kat bleef zitten.');

    sentenceStart(early);
    expect(document.querySelector('.tts-sentence')?.textContent).toBe('De kat zat op de mat.');
  });

  it('highlight de eerste voorkoms na een seek achteruit over een herhaalde zin', () => {
    const sentences = restart();
    // De fixture bevat "Herhaling komt voor." twee keer; i1 < i2.
    const indices = sentences.filter((s) => s.text === 'Herhaling komt voor.').map((s) => s.id);
    expect(indices.length).toBe(2);
    const [i1, i2] = indices;
    expect(i1).toBeLessThan(i2);

    // Speel eerst de TWEEDE voorkoms af (sprong vooruit).
    sentenceStart(i2);
    expect(document.querySelector('.tts-sentence')?.textContent).toBe('Herhaling komt voor.');

    // Seek daarna ACHTERUIT naar de eerste voorkoms.
    sentenceStart(i1);
    const span = document.querySelector('.tts-sentence');
    expect(span?.textContent).toBe('Herhaling komt voor.');
    // De gemarkeerde zin moet de eerste voorkoms zijn: de tweede staat dan
    // nog als gewone tekst direct achter de span.
    expect(span?.nextSibling?.nodeValue).toContain('Herhaling komt voor.');
  });
});
