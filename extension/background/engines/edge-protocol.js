// Pure functies voor het onofficiële Edge TTS websocket-protocol.
// Zie https://github.com/rany2/edge-tts voor de referentie-implementatie.

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
// DRM-versie van de Edge-build; bij 403-fouten deze opnieuw afleiden van een actuele Edge-versie.
export const SEC_MS_GEC_VERSION = '1-131.0.2903.99';
export const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const WIN_EPOCH_SECONDS = 11644473600; // seconden tussen 1-1-1601 en 1-1-1970

export function generateConnectionId() {
  // 32 hex-karakters (uuid zonder streepjes); crypto.getRandomValues is overal beschikbaar.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeSecMsGec(nowMs = Date.now()) {
  let ticks = Math.floor(nowMs / 1000) + WIN_EPOCH_SECONDS;
  ticks -= ticks % 300; // afronden naar 5-minutenvenster
  const input = `${BigInt(ticks) * 10_000_000n}${TRUSTED_CLIENT_TOKEN}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function buildWssUrl({ connectionId, secMsGec }) {
  return 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
    + `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`
    + `&Sec-MS-GEC=${secMsGec}`
    + `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}`
    + `&ConnectionId=${connectionId}`;
}

export function buildConfigMessage() {
  return `X-Timestamp:${new Date().toISOString()}\r\n`
    + 'Content-Type:application/json; charset=utf-8\r\n'
    + 'Path:speech.config\r\n\r\n'
    + JSON.stringify({
        context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
          outputFormat: OUTPUT_FORMAT,
        } } },
      });
}

export function rateToPct(rate) {
  const clamped = Math.min(2, Math.max(0.5, rate));
  const pct = Math.round((clamped - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function escapeXml(s) {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function buildSsmlMessage({ text, voice, ratePct, requestId }) {
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='nl-NL'>`
    + `<voice name='${voice}'><prosody pitch='+0Hz' rate='${ratePct}' volume='+0%'>`
    + `${escapeXml(text)}</prosody></voice></speak>`;
  return `X-RequestId:${requestId}\r\n`
    + 'Content-Type:application/ssml+xml\r\n'
    + `X-Timestamp:${new Date().toISOString()}\r\n`
    + `Path:ssml\r\n\r\n${ssml}`;
}

// Binair frame: 2 bytes big-endian headerlengte, dan ascii-headers, dan payload.
export function parseBinaryFrame(buf) {
  const view = new DataView(buf);
  const headerLen = view.getUint16(0);
  const headerText = new TextDecoder().decode(new Uint8Array(buf, 2, headerLen));
  const path = /Path:([^\r\n]+)/.exec(headerText)?.[1] ?? '';
  return { path, payload: new Uint8Array(buf, 2 + headerLen) };
}

// Tekstframe: headers en body gescheiden door een lege regel.
export function parseTextFrame(str) {
  const idx = str.indexOf('\r\n\r\n');
  const headers = idx >= 0 ? str.slice(0, idx) : str;
  const body = idx >= 0 ? str.slice(idx + 4) : '';
  const path = /Path:([^\r\n]+)/.exec(headers)?.[1] ?? '';
  return { path, body };
}

// WordBoundary-metadata: Offset/Duration in 100ns-eenheden → milliseconden.
export function extractWordBoundaries(jsonBody) {
  let parsed;
  try { parsed = JSON.parse(jsonBody); } catch { return []; }
  return (parsed.Metadata ?? [])
    .filter((m) => m.Type === 'WordBoundary' && m.Data?.text?.Text != null)
    .map((m) => ({
      text: m.Data.text.Text,
      offsetMs: Math.round(m.Data.Offset / 10000),
      durationMs: Math.round(m.Data.Duration / 10000),
    }));
}
