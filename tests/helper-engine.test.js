import { describe, it, expect } from 'vitest';
import { createHelperEngine } from '../extension/background/engines/helper-engine.js';

const okResponse = (body) => Promise.resolve({
  ok: true, status: 200, json: () => Promise.resolve(body),
});

describe('helper-engine', () => {
  it('synthesize post naar /synthesize en decodeert base64-audio', async () => {
    const calls = [];
    const fetchImpl = (url, opts) => {
      calls.push({ url, opts });
      return okResponse({
        audio_b64: btoa('MP3'), format: 'mp3',
        boundaries: [{ text: 'Hallo', offsetMs: 0, durationMs: 300 }],
      });
    };
    const engine = createHelperEngine({ fetchImpl });
    const { audio, boundaries } = await engine.synthesize({
      text: 'Hallo.', voice: 'nl-NL-MaartenNeural', rate: 1.5, engine: 'edge',
    });
    expect(calls[0].url).toBe('http://127.0.0.1:5020/synthesize');
    expect(JSON.parse(calls[0].opts.body)).toEqual({
      text: 'Hallo.', voice: 'nl-NL-MaartenNeural', rate: 1.5, engine: 'edge',
    });
    expect(await audio.text()).toBe('MP3');
    expect(boundaries[0].offsetMs).toBe(0);
  });

  it('helper-offline bij netwerkfout', async () => {
    const engine = createHelperEngine({ fetchImpl: () => Promise.reject(new TypeError('fetch failed')) });
    await expect(engine.synthesize({ text: 'x', voice: 'v', rate: 1, engine: 'edge' }))
      .rejects.toThrow('helper-offline');
  });

  it('502 detail wordt de foutmelding', async () => {
    const fetchImpl = () => Promise.resolve({
      ok: false, status: 502, json: () => Promise.resolve({ detail: 'Edge TTS websocket-fout' }),
    });
    const engine = createHelperEngine({ fetchImpl });
    await expect(engine.synthesize({ text: 'x', voice: 'v', rate: 1, engine: 'edge' }))
      .rejects.toThrow('Edge TTS websocket-fout');
  });

  it('422 met detail als array valt terug op helper-fout <status>', async () => {
    // FastAPI stuurt bij een validatiefout een array in detail; die mag niet
    // als "[object Object]" in de foutmelding belanden.
    const fetchImpl = () => Promise.resolve({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: [{ loc: ['body', 'text'], msg: 'field required' }] }),
    });
    const engine = createHelperEngine({ fetchImpl });
    await expect(engine.synthesize({ text: 'x', voice: 'v', rate: 1, engine: 'edge' }))
      .rejects.toThrow('helper-fout 422');
  });

  it('available() checkt /health', async () => {
    const engine = createHelperEngine({
      fetchImpl: () => okResponse({ status: 'ok', engines: { edge: true, piper: true } }),
    });
    expect(await engine.available()).toBe(true);
    const down = createHelperEngine({ fetchImpl: () => Promise.reject(new TypeError('x')) });
    expect(await down.available()).toBe(false);
  });
});
