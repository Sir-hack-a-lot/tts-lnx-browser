import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../extension/content/language-detect.js';

describe('detectLanguage', () => {
  it('herkent Nederlands', () => {
    expect(detectLanguage('Dit is een Nederlandse zin die niet moeilijk is, en die we met het bloot oog kunnen lezen omdat de woorden heel gewoon zijn.')).toBe('nl');
  });
  it('herkent Engels', () => {
    expect(detectLanguage('This is an English sentence that is not difficult, and that you can read with the naked eye because the words are very common.')).toBe('en');
  });
  it('herkent Duits', () => {
    expect(detectLanguage('Dies ist ein deutscher Satz, der nicht schwer ist, und den man mit blosssem Auge lesen kann, weil die Wörter sehr gewöhnlich sind.')).toBe('de');
  });
  it('geeft null bij te weinig woorden', () => {
    expect(detectLanguage('Hallo wereld')).toBe(null);
  });
});
