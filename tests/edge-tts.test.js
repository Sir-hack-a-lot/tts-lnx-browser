import { describe, it, expect } from 'vitest';
import { createEdgeEngine } from '../extension/background/engines/edge-tts.js';
import { buildBinaryFrame, buildTextFrame } from './fixtures/edge-frames.js';

// Nep-websocket die frames afspeelt zodra de SSML verstuurd is.
class FakeWebSocket {
  constructor(url) { this.url = url; this.sent = []; FakeWebSocket.last = this; }
  send(msg) {
    this.sent.push(msg);
    if (msg.includes('Path:ssml')) {
      const metadata = JSON.stringify({ Metadata: [
        { Type: 'WordBoundary', Data: { Offset: 0, Duration: 3000000, text: { Text: 'Hallo', Length: 5 } } },
      ]});
      setTimeout(() => {
        this.onmessage({ data: buildTextFrame('audio.metadata', metadata) });
        this.onmessage({ data: buildBinaryFrame('audio', new Uint8Array([1, 2])) });
        this.onmessage({ data: buildBinaryFrame('audio', new Uint8Array([3])) });
        this.onmessage({ data: buildTextFrame('turn.end', '{}') });
      }, 0);
    }
  }
  close() { this.closed = true; }
}

describe('createEdgeEngine', () => {
  it('stuurt config + ssml en levert audio met woordgrenzen', async () => {
    const engine = createEdgeEngine({ WebSocketImpl: FakeWebSocket, now: () => 0 });
    const result = await engine.synthesize({ text: 'Hallo', voice: 'nl-NL-FennaNeural', rate: 1.25 });
    const ws = FakeWebSocket.last;
    expect(ws.sent[0]).toContain('Path:speech.config');
    expect(ws.sent[1]).toContain('Path:ssml');
    expect(ws.sent[1]).toContain("rate='+25%'");
    expect(await result.audio.text().then(() => result.audio.size)).toBe(3);
    expect(result.audio.type).toBe('audio/mpeg');
    expect(result.boundaries).toEqual([{ text: 'Hallo', offsetMs: 0, durationMs: 300 }]);
  });

  it('reject bij timeout als turn.end uitblijft', async () => {
    class SilentWS {
      constructor() { this.sent = []; }
      send() {}
      close() {}
    }
    const engine = createEdgeEngine({ WebSocketImpl: SilentWS, timeoutMs: 20, now: () => 0 });
    await expect(engine.synthesize({ text: 'x', voice: 'nl-NL-FennaNeural', rate: 1 }))
      .rejects.toThrow('timeout');
  });

  it('reject bij websocket-fout', async () => {
    class ErrorWS {
      constructor() { setTimeout(() => this.onerror?.(new Error('kapot')), 0); }
      send() {}
      close() {}
    }
    const engine = createEdgeEngine({ WebSocketImpl: ErrorWS, now: () => 0 });
    await expect(engine.synthesize({ text: 'x', voice: 'nl-NL-FennaNeural', rate: 1 }))
      .rejects.toThrow('websocket');
  });
});
