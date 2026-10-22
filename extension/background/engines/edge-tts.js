// Websocket-orchestratie voor Edge TTS. WebSocket wordt geïnjecteerd zodat
// deze module zonder netwerk te testen is.
import {
  buildWssUrl, buildConfigMessage, buildSsmlMessage, generateConnectionId,
  computeSecMsGec, parseBinaryFrame, parseTextFrame, extractWordBoundaries, rateToPct,
} from './edge-protocol.js';

export function createEdgeEngine({ WebSocketImpl = globalThis.WebSocket, timeoutMs = 15000, now = () => Date.now() } = {}) {
  return {
    name: 'edge',
    isLocal: false,

    async available() {
      return typeof navigator === 'undefined' ? true : navigator.onLine;
    },

    async synthesize({ text, voice, rate = 1 }) {
      const secMsGec = await computeSecMsGec(now());
      const url = buildWssUrl({ connectionId: generateConnectionId(), secMsGec });
      const requestId = generateConnectionId();

      return new Promise((resolve, reject) => {
        const chunks = [];
        const boundaries = [];
        let settled = false;

        const ws = new WebSocketImpl(url);
        ws.binaryType = 'arraybuffer';
        const timer = setTimeout(() => settle(new Error('Edge TTS timeout')), timeoutMs);

        function settle(err, result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch { /* negeren */ }
          if (err) reject(err); else resolve(result);
        }

        function done() {
          settle(null, { audio: new Blob(chunks, { type: 'audio/mpeg' }), boundaries });
        }

        // Echte websockets versturen pas zodra de verbinding open is; de
        // geïnjecteerde test-fakes hebben geen readyState/onopen-cyclus en
        // worden daarom direct gestart.
        let started = false;
        function start() {
          if (started) return;
          started = true;
          ws.send(buildConfigMessage());
          ws.send(buildSsmlMessage({ text, voice, ratePct: rateToPct(rate), requestId }));
        }
        ws.onopen = start;
        ws.onerror = () => settle(new Error('Edge TTS websocket-fout'));
        ws.onmessage = (ev) => {
          try {
            if (typeof ev.data === 'string') {
              const { path, body } = parseTextFrame(ev.data);
              if (path === 'audio.metadata') boundaries.push(...extractWordBoundaries(body));
              else if (path === 'turn.end') done();
            } else {
              const { path, payload } = parseBinaryFrame(ev.data);
              if (path === 'audio') chunks.push(payload);
              else if (path === 'turn.end') done();
            }
          } catch (err) {
            settle(err);
          }
        };
        if (ws.readyState === undefined || ws.readyState === 1) start();
      });
    },
  };
}
