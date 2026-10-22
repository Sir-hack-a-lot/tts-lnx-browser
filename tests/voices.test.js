import { describe, it, expect } from 'vitest';
import { VOICES, DEFAULT_LANG, resolveVoice } from '../extension/shared/voices.js';

describe('voices', () => {
  it('heeft stemmen voor alle MVP-talen', () => {
    for (const lang of ['nl', 'en', 'de', 'fr', 'es']) {
      expect(VOICES[lang]?.length).toBeGreaterThan(0);
    }
  });
  it('resolveVoice gebruikt de eerste stem van de taal', () => {
    expect(resolveVoice('nl', {})).toBe(VOICES.nl[0]);
  });
  it('resolveVoice respecteert een override', () => {
    expect(resolveVoice('nl', { nl: 'nl-NL-MaartenNeural' })).toBe('nl-NL-MaartenNeural');
  });
  it('resolveVoice valt terug op DEFAULT_LANG bij onbekende taal', () => {
    expect(resolveVoice('ja', {})).toBe(VOICES[DEFAULT_LANG][0]);
  });
});
