import { describe, it, expect } from 'vitest';
import { VOICES, DEFAULT_LANG, resolveVoice } from '../extension/shared/voices.js';

describe('voices', () => {
  it('heeft stemmen voor alle MVP-talen, elk met id en engine', () => {
    for (const lang of ['nl', 'en', 'de', 'fr', 'es']) {
      expect(VOICES[lang]?.length).toBeGreaterThan(0);
      for (const v of VOICES[lang]) {
        expect(typeof v.id).toBe('string');
        expect(['edge', 'piper']).toContain(v.engine);
      }
    }
  });
  it('heeft minstens de piper-stem nl_NL-mls-medium voor Nederlands', () => {
    expect(VOICES.nl.some((v) => v.engine === 'piper' && v.id === 'nl_NL-mls-medium')).toBe(true);
  });
  it('resolveVoice gebruikt standaard de edge-engine (oude aanroep blijft werken)', () => {
    expect(resolveVoice('nl', {})).toBe('nl-NL-FennaNeural');
  });
  it('resolveVoice filtert op de gevraagde engine', () => {
    expect(resolveVoice('nl', {}, 'piper')).toBe('nl_NL-mls-medium');
    expect(resolveVoice('nl', {}, 'edge')).toBe('nl-NL-FennaNeural');
  });
  it('resolveVoice respecteert een override van dezelfde engine', () => {
    expect(resolveVoice('nl', { nl: 'nl-NL-MaartenNeural' })).toBe('nl-NL-MaartenNeural');
    expect(resolveVoice('nl', { nl: 'nl_NL-mls-medium' }, 'piper')).toBe('nl_NL-mls-medium');
  });
  it('resolveVoice negeert een override van een andere engine', () => {
    // Een edge-override mag bij de piper-engine niet lekken: voice-id's zijn
    // engine-specifiek.
    expect(resolveVoice('nl', { nl: 'nl-NL-MaartenNeural' }, 'piper')).toBe('nl_NL-mls-medium');
    expect(resolveVoice('nl', { nl: 'nl_NL-mls-medium' }, 'edge')).toBe('nl-NL-FennaNeural');
  });
  it('resolveVoice valt terug op DEFAULT_LANG bij onbekende taal, per engine', () => {
    expect(resolveVoice('ja', {})).toBe('nl-NL-FennaNeural');
    expect(resolveVoice('ja', {}, 'piper')).toBe('nl_NL-mls-medium');
  });
  it('resolveVoice valt terug op DEFAULT_LANG als een taal geen stemmen van de engine heeft', () => {
    // Duits heeft (nog) geen piper-stem: piper valt terug op DEFAULT_LANG.
    expect(VOICES.de.every((v) => v.engine === 'edge')).toBe(true);
    expect(resolveVoice('de', {}, 'piper')).toBe(resolveVoice(DEFAULT_LANG, {}, 'piper'));
  });
});
