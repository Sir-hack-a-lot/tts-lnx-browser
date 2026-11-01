// Tests voor de pdf.js-tekstextractie-hulpfuncties van de viewer.
import { describe, it, expect } from 'vitest';
import { buildSourceText, fileNameFromSrc } from '../extension/viewer/pdf-source.js';

describe('buildSourceText', () => {
  it('voegt items samen en zet regel-einden om in newlines', () => {
    const items = [
      { str: 'Eerste regel.', hasEOL: true },
      { str: 'Tweede regel zonder einde' },
      { str: ' met vervolg.', hasEOL: true },
    ];
    expect(buildSourceText(items)).toBe('Eerste regel.\nTweede regel zonder einde met vervolg.\n');
  });

  it('tolereert lege en ontbrekende invoer', () => {
    expect(buildSourceText([])).toBe('');
    expect(buildSourceText(undefined)).toBe('');
  });
});

describe('fileNameFromSrc', () => {
  it('haalt de bestandsnaam uit de URL en decodeert hem', () => {
    expect(fileNameFromSrc('https://voorbeeld.nl/docs/jaarverslag%202026.pdf?x=1'))
      .toBe('jaarverslag 2026.pdf');
  });

  it('geeft null bij een ongeldige URL of naamloos pad', () => {
    expect(fileNameFromSrc('geen-url')).toBeNull();
    expect(fileNameFromSrc('https://voorbeeld.nl/')).toBeNull();
  });
});
