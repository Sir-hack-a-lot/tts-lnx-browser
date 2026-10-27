import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHelperEngine } from '../extension/background/engines/helper-engine.js';

// Gedeeld contract met de helper: de Python-contracttest vergelijkt de echte
// /synthesize-response met exact deze fixture.
const fixturePath = fileURLToPath(new URL('./fixtures/synthesize-response.json', import.meta.url));
const contract = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('contract helper <-> extensie', () => {
  it('helper-engine parset de gedeelde contract-fixture', async () => {
    const fetchImpl = () => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(contract),
    });
    const engine = createHelperEngine({ fetchImpl });
    const { audio, boundaries } = await engine.synthesize({
      text: 'Hallo.', voice: 'nl-NL-MaartenNeural', rate: 1.0, engine: 'edge',
    });
    // "TVAz" is base64 voor "MP3".
    expect(await audio.text()).toBe('MP3');
    expect(audio.type).toBe('audio/mpeg');
    expect(boundaries).toEqual(contract.boundaries);
  });
});
