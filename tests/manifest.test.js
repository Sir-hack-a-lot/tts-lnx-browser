// Regressietest: Firefox match patterns negeren poorten — een host-permissie
// mét poort (bijv. "http://127.0.0.1:5020/") matcht nergens, waardoor de
// fetch naar de helper CORS-geblokkeerd wordt (bewezen 2026-10-28 via een
// diagnose-extensie in een draaiende Firefox). Daarom mag geen enkele
// permissie in het manifest een poort bevatten.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('manifest permissions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));

  it('bevat geen poortnummers in host-permissies', () => {
    for (const p of manifest.permissions) {
      expect(p, `permissie "${p}" bevat een poort`).not.toMatch(/:\d+\//);
    }
  });

  it('heeft een host-permissie voor de helper op localhost', () => {
    expect(manifest.permissions.some((p) => p.startsWith('http://127.0.0.1/'))).toBe(true);
  });

  // AMO vereist voor nieuwe extensies een dataverzameling-verklaring. Wij
  // sturen paginatekst naar Microsoft als de cloud-engine actief is, dus
  // websiteContent is de eerlijke (verplichte) categorie.
  it('verklaart websiteContent als verplichte dataverzameling', () => {
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions)
      .toEqual({ required: ['websiteContent'] });
  });
});
