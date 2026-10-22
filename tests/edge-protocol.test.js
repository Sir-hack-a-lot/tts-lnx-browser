import { describe, it, expect } from 'vitest';
import {
  TRUSTED_CLIENT_TOKEN, generateConnectionId, computeSecMsGec, buildWssUrl,
  buildConfigMessage, rateToPct, buildSsmlMessage,
  parseBinaryFrame, parseTextFrame, extractWordBoundaries,
} from '../extension/background/engines/edge-protocol.js';
import { buildBinaryFrame, buildTextFrame } from './fixtures/edge-frames.js';

describe('generateConnectionId', () => {
  it('geeft 32 hex-karakters zonder streepjes', () => {
    const id = generateConnectionId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(generateConnectionId()).not.toBe(id);
  });
});

describe('computeSecMsGec', () => {
  it('is 64 uppercase hex en deterministisch per 5-minutenvenster', async () => {
    // NB: 12:32:00Z ligt 120s in het venster; +60s valt in hetzelfde venster.
    // (12:34:56Z uit de oorspronkelijke brief lag 296s in het venster en kruiste de grens.)
    const now = new Date('2026-10-22T12:32:00Z').getTime();
    const a = await computeSecMsGec(now);
    expect(a).toMatch(/^[0-9A-F]{64}$/);
    expect(await computeSecMsGec(now + 60_000)).toBe(a);          // zelfde venster
    expect(await computeSecMsGec(now + 6 * 60_000)).not.toBe(a);  // volgend venster
  });
  it('volgt het gedocumenteerde algoritme (onafhankelijke herberekening)', async () => {
    const now = new Date('2026-10-22T12:34:56Z').getTime();
    const WIN_EPOCH = 11644473600;
    let ticks = Math.floor(now / 1000) + WIN_EPOCH;
    ticks -= ticks % 300;
    const input = `${BigInt(ticks) * 10_000_000n}${TRUSTED_CLIENT_TOKEN}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const expected = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    expect(await computeSecMsGec(now)).toBe(expected);
  });
});

describe('buildWssUrl', () => {
  it('bevat token, gec en connection-id', () => {
    const url = buildWssUrl({ connectionId: 'c1', secMsGec: 'g1' });
    expect(url).toContain('wss://speech.platform.bing.com/');
    expect(url).toContain(`TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`);
    expect(url).toContain('Sec-MS-GEC=g1');
    expect(url).toContain('ConnectionId=c1');
  });
});

describe('buildConfigMessage', () => {
  it('vraagt woordgrenzen en mp3-output aan', () => {
    const msg = buildConfigMessage();
    expect(msg).toContain('Path:speech.config');
    expect(msg).toContain('"wordBoundaryEnabled":"true"');
    expect(msg).toContain('audio-24khz-48kbitrate-mono-mp3');
  });
});

describe('rateToPct', () => {
  it('zet snelheid om naar procent-string', () => {
    expect(rateToPct(1)).toBe('+0%');
    expect(rateToPct(1.25)).toBe('+25%');
    expect(rateToPct(0.5)).toBe('-50%');
  });
  it('clampt op 0.5–2.0', () => {
    expect(rateToPct(0.1)).toBe('-50%');
    expect(rateToPct(3)).toBe('+100%');
  });
});

describe('buildSsmlMessage', () => {
  it('bevat stem, rate en ge-escapete tekst', () => {
    const msg = buildSsmlMessage({ text: '5 & 6 <test>', voice: 'nl-NL-FennaNeural', ratePct: '+25%', requestId: 'r1' });
    expect(msg).toContain('Path:ssml');
    expect(msg).toContain('X-RequestId:r1');
    expect(msg).toContain("name='nl-NL-FennaNeural'");
    expect(msg).toContain("rate='+25%'");
    expect(msg).toContain('5 &amp; 6 &lt;test&gt;');
  });
});

describe('parseBinaryFrame', () => {
  it('splitst header en payload', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const { path, payload: out } = parseBinaryFrame(buildBinaryFrame('audio', payload));
    expect(path).toBe('audio');
    expect([...out]).toEqual([1, 2, 3]);
  });
});

describe('parseTextFrame', () => {
  it('splitst header en body', () => {
    const { path, body } = parseTextFrame(buildTextFrame('turn.end', '{}'));
    expect(path).toBe('turn.end');
    expect(body).toBe('{}');
  });
});

describe('extractWordBoundaries', () => {
  it('zet 100ns-eenheden om naar milliseconden', () => {
    const body = JSON.stringify({ Metadata: [
      { Type: 'WordBoundary', Data: { Offset: 500000, Duration: 3000000, text: { Text: 'Hallo', Length: 5 } } },
      { Type: 'WordBoundary', Data: { Offset: 4000000, Duration: 2000000, text: { Text: 'wereld', Length: 6 } } },
      { Type: 'SentenceBoundary', Data: {} },
    ]});
    expect(extractWordBoundaries(body)).toEqual([
      { text: 'Hallo', offsetMs: 50, durationMs: 300 },
      { text: 'wereld', offsetMs: 400, durationMs: 200 },
    ]);
  });
  it('geeft lege array bij ontbrekende metadata', () => {
    expect(extractWordBoundaries('{}')).toEqual([]);
  });
});
