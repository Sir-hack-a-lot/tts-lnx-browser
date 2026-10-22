import { describe, it, expect } from 'vitest';
import { splitSentences } from '../extension/content/sentence-split.js';

describe('splitSentences', () => {
  it('splitst twee gewone zinnen', () => {
    expect(splitSentences('Hallo wereld. Hoe gaat het?')).toEqual(['Hallo wereld.', 'Hoe gaat het?']);
  });
  it('beschermt afkortingen', () => {
    expect(splitSentences('Dr. Jansen werkt bij de UvA. Hij is er klaar mee.'))
      .toEqual(['Dr. Jansen werkt bij de UvA.', 'Hij is er klaar mee.']);
  });
  it('beschermt decimalen', () => {
    expect(splitSentences('De prijs is 3.50 euro. Duur!')).toEqual(['De prijs is 3.50 euro.', 'Duur!']);
  });
  it('beschermt URL\'s', () => {
    expect(splitSentences('Kijk op https://nu.nl voor meer. Tot ziens.'))
      .toEqual(['Kijk op https://nu.nl voor meer.', 'Tot ziens.']);
  });
  it('behandelt ellipsis als deel van de zin', () => {
    expect(splitSentences('Wacht even... oké nu.')).toEqual(['Wacht even... oké nu.']);
  });
  it('sluit aanhalingstekens en haakjes bij de zin in', () => {
    expect(splitSentences('Hij zei: "Kom hier!" en liep weg.'))
      .toEqual(['Hij zei: "Kom hier!"', 'en liep weg.']);
  });
  it('normaliseert whitespace', () => {
    expect(splitSentences('Eerste   zin.\n\nTweede   zin.')).toEqual(['Eerste zin.', 'Tweede zin.']);
  });
  it('geeft lege array bij lege invoer', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });
});
