// Houdt de twee locale-bestanden en het manifest met elkaar in de pas:
// gelijke key-verzamelingen en elke __MSG_key__ in het manifest bestaat.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import en from '../extension/_locales/en/messages.json';
import nl from '../extension/_locales/nl/messages.json';

const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));

describe('i18n', () => {
  it('nl en en hebben exact dezelfde message-keys', () => {
    expect(Object.keys(nl).sort()).toEqual(Object.keys(en).sort());
  });

  it('elke key heeft in beide talen een niet-lege message', () => {
    for (const [locale, messages] of [['en', en], ['nl', nl]]) {
      for (const [key, entry] of Object.entries(messages)) {
        expect(entry.message?.trim(), `${locale}.${key} is leeg`).toBeTruthy();
      }
    }
  });

  it('elke __MSG_key__ in het manifest bestaat in beide locales', () => {
    const refs = JSON.stringify(manifest).match(/__MSG_[A-Za-z0-9_]+__/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const key = ref.slice(6, -2);
      expect(en, `${ref} ontbreekt in en`).toHaveProperty(key);
      expect(nl, `${ref} ontbreekt in nl`).toHaveProperty(key);
    }
  });

  it('heeft default_locale met een bijbehorende map, en de build kopieert _locales', () => {
    expect(manifest.default_locale).toBe('en');
    // Zonder gekopieerde _locales in dist/ is de extensie corrupt; beide
    // helften van die invariant worden hier bewaakt.
    expect(existsSync(new URL(`../extension/_locales/${manifest.default_locale}/messages.json`, import.meta.url))).toBe(true);
    const buildScript = readFileSync(new URL('../scripts/build.js', import.meta.url), 'utf8');
    expect(buildScript).toContain("cp('extension/_locales', 'dist/_locales'");
  });
});
