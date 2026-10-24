// Pure functies voor het onofficiële Edge TTS websocket-protocol.
// Zie https://github.com/rany2/edge-tts voor de referentie-implementatie.

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
// DRM-versie: "2-" + actuele Chromium-build. Bij 403-fouten opnieuw afleiden
// van edge-tts upstream (src/edge_tts/constants.py).
export const SEC_MS_GEC_VERSION = '2-143.0.3650.75';
// De dienst weigert de websocket-handshake (403) zonder Edge-User-Agent.
// Browsers staan geen UA-override op WebSocket toe, dus de background
// herschrijft de header via webRequest (zie background.js).
export const EDGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
export const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const WIN_EPOCH_SECONDS = 11644473600; // seconden tussen 1-1-1601 en 1-1-1970

export function generateConnectionId() {
  // 32 hex-karakters (uuid zonder streepjes); crypto.getRandomValues is overal beschikbaar.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Sec-MS-GEC v2: "CS64-SHA256", geport van edge-tts drm.py (rany2/edge-tts) ---
// Microsoft heeft het v1-token (alleen SHA-256-hex) buiten gebruik gesteld;
// de dienst eist nu het v2-formaat "<16 hex>-<64 hex>".

const U32 = 0xFFFFFFFF;

const SHA256_INITIAL = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
// Voorberekende toestand/schedule-fragmenten van een vaste 57-byte prefix
// (de prefix zelf is niet bekend; deze constanten komen uit drm.py).
const SHA256_STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const SHA256_SCHEDULE = [0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564];
const SHA256_ROUND_CONSTANTS = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];
const SHA256_ADJUSTMENT = 0xC9DC06A7;
const SHA256_BLOCK_CONSTANTS = [
  ...SHA256_ROUND_CONSTANTS.slice(0, 14), SHA256_ADJUSTMENT, ...SHA256_ROUND_CONSTANTS.slice(15),
];
const SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;

const CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038],
  [0xC89C5933, 0xB328CBDF], [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C],
  [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB], [0x06064CF3, 0xFA51A3DA],
  [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xF2F90B1A;
const CS64_ADJUSTMENT1 = 0x0B1A0000;

function rol16(v) {
  return (((v << 16) | (v >>> 16)) >>> 0);
}

// Data als little-endian 32-bit woorden, zero-padded tot een even aantal.
function wordsLe4Even(data) {
  const padded = data.length + ((4 - (data.length % 4)) % 4);
  const words = [];
  for (let i = 0; i < padded; i += 4) {
    words.push(((data[i] ?? 0) | ((data[i + 1] ?? 0) << 8) | ((data[i + 2] ?? 0) << 16) | ((data[i + 3] ?? 0) << 24)) >>> 0);
  }
  if (words.length % 2) words.push(0);
  return words;
}

function sigma0(v) {
  return ((v >>> 7) ^ (v << 25) ^ (v >>> 18) ^ (v << 14) ^ (v >>> 3)) >>> 0;
}

function sigma1(v) {
  return ((v >>> 17) ^ (v << 15) ^ (v >>> 19) ^ (v << 13) ^ (v >>> 10)) >>> 0;
}

// SHA-256-rondes, eventueel hervat midden in het eerste blok. De "rotaties"
// lopen via x * (2^32+1) in 64-bit (BigInt) zodat de hoge bits meeliften tot
// de eindmaskering, zoals in de referentie.
function sha256Rounds(stateIn, words, firstRound = 0) {
  let [a, b, c, d, e, f, g, h] = stateIn;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  const aligned = Math.min(64, Math.floor((firstRound + 7) / 8) * 8);
  const B = (x) => BigInt(x >>> 0);
  const M = 0xFFFFFFFFn;
  const lo = (x) => Number(x & M) >>> 0;
  const rotE = () => B(e) * 0x100000001n;
  const rotA = () => B(a) * 0x100000001n;
  const sumE = (r) => (r >> 6n) ^ (r >> 11n) ^ (r >> 25n);
  const sumA = (r) => (r >> 2n) ^ (r >> 13n) ^ (r >> 22n);

  for (let i = firstRound; i < aligned; i++) {
    const t1 = B(h) + sumE(rotE()) + B(g ^ (e & (f ^ g))) + B(constants[i]) + B(words[i]);
    const t2 = sumA(rotA()) + B((a & b) | (c & (a | b)));
    const na = lo(t1 + t2);
    const ne = lo(B(d) + t1);
    h = g; g = f; f = e; e = ne; d = c; c = b; b = a; a = na;
  }
  for (let i = aligned; i < 64; i += 8) {
    let r = rotE();
    let t1 = B(h) + sumE(r) + B(g ^ (e & (f ^ g))) + B(constants[i]) + B(words[i]);
    d = lo(B(d) + t1);
    h = lo(t1 + sumA(rotA()) + B((a & b) | (c & (a | b))));
    r = B(d) * 0x100000001n;
    t1 = B(g) + sumE(r) + B(f ^ (d & (e ^ f))) + B(constants[i + 1]) + B(words[i + 1]);
    c = lo(B(c) + t1);
    g = lo(t1 + ((B(h) * 0x100000001n >> 2n) ^ (B(h) * 0x100000001n >> 13n) ^ (B(h) * 0x100000001n >> 22n)) + B((h & a) | (b & (h | a))));
    r = B(c) * 0x100000001n;
    t1 = B(f) + sumE(r) + B(e ^ (c & (d ^ e))) + B(constants[i + 2]) + B(words[i + 2]);
    b = lo(B(b) + t1);
    f = lo(t1 + ((B(g) * 0x100000001n >> 2n) ^ (B(g) * 0x100000001n >> 13n) ^ (B(g) * 0x100000001n >> 22n)) + B((g & h) | (a & (g | h))));
    r = B(b) * 0x100000001n;
    t1 = B(e) + sumE(r) + B(d ^ (b & (c ^ d))) + B(constants[i + 3]) + B(words[i + 3]);
    a = lo(B(a) + t1);
    e = lo(t1 + ((B(f) * 0x100000001n >> 2n) ^ (B(f) * 0x100000001n >> 13n) ^ (B(f) * 0x100000001n >> 22n)) + B((f & g) | (h & (f | g))));
    r = B(a) * 0x100000001n;
    t1 = B(d) + sumE(r) + B(c ^ (a & (b ^ c))) + B(constants[i + 4]) + B(words[i + 4]);
    h = lo(B(h) + t1);
    d = lo(t1 + ((B(e) * 0x100000001n >> 2n) ^ (B(e) * 0x100000001n >> 13n) ^ (B(e) * 0x100000001n >> 22n)) + B((e & f) | (g & (e | f))));
    r = B(h) * 0x100000001n;
    t1 = B(c) + sumE(r) + B(b ^ (h & (a ^ b))) + B(constants[i + 5]) + B(words[i + 5]);
    g = lo(B(g) + t1);
    c = lo(t1 + ((B(d) * 0x100000001n >> 2n) ^ (B(d) * 0x100000001n >> 13n) ^ (B(d) * 0x100000001n >> 22n)) + B((d & e) | (f & (d | e))));
    r = B(g) * 0x100000001n;
    t1 = B(b) + sumE(r) + B(a ^ (g & (h ^ a))) + B(constants[i + 6]) + B(words[i + 6]);
    f = lo(B(f) + t1);
    b = lo(t1 + ((B(c) * 0x100000001n >> 2n) ^ (B(c) * 0x100000001n >> 13n) ^ (B(c) * 0x100000001n >> 22n)) + B((c & d) | (e & (c | d))));
    r = B(f) * 0x100000001n;
    t1 = B(a) + sumE(r) + B(h ^ (f & (g ^ h))) + B(constants[i + 7]) + B(words[i + 7]);
    e = lo(B(e) + t1);
    a = lo(t1 + ((B(b) * 0x100000001n >> 2n) ^ (B(b) * 0x100000001n >> 13n) ^ (B(b) * 0x100000001n >> 22n)) + B((b & c) | (d & (b | c))));
  }
  return [a, b, c, d, e, f, g, h];
}

function expandSha256Schedule(words, firstWord = 16) {
  for (let i = firstWord; i < 64; i++) {
    const x = words[i - 2], y = words[i - 15];
    words.push((sigma1(x) + words[i - 7] + sigma0(y) + words[i - 16]) >>> 0);
  }
}

// Eerste blok is voorberekend rond een vaste prefix; hervat op ronde 14.
function sha256Init(data) {
  const words = new Array(14).fill(0);
  words.push(((data[0] << 16) | (data[1] << 8) | data[2]) >>> 0);
  words.push(((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) >>> 0);
  for (let i = 16; i < 30; i++) {
    let value = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) value += (i === 16) ? (sigma1(words[i - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) : sigma1(words[i - 2]);
    if (i - 7 >= 14) value += words[i - 7];
    if (i - 15 >= 14) value += (i === 29) ? (sigma0(words[i - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) : sigma0(words[i - 15]);
    words.push(value >>> 0);
  }
  words.push((sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]) >>> 0);
  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, i) => (x + working[i]) >>> 0);
}

// Aangepaste SHA-256 over (57-byte prefix || data); zie sha256Init.
function sha256DigestCustom(data) {
  if (data.length < 7) throw new Error('Token-salt moet minstens 7 bytes bevatten');
  const length = 57 + data.length;
  const rest = data.slice(7);
  const padLen = ((55 - length) % 64 + 64) % 64;
  const padded = new Uint8Array(rest.length + 1 + padLen + 8);
  padded.set(rest, 0);
  padded[rest.length] = 0x80;
  new DataView(padded.buffer).setBigUint64(padded.length - 8, BigInt(length) * 8n);
  let state = sha256Init(data.slice(0, 7));
  const view = new DataView(padded.buffer);
  for (let off = 0; off < padded.length; off += 64) {
    const words = [];
    for (let i = 0; i < 16; i++) words.push(view.getUint32(off + i * 4));
    expandSha256Schedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((x, i) => (x + working[i]) >>> 0);
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  state.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}

function cs64Digest(data, digest) {
  const dv = new DataView(digest.buffer, digest.byteOffset);
  const keyA = dv.getUint32(0, true) | 1;
  const keyB = dv.getUint32(4, true) | 1;
  const factors = [Math.imul(keyA, CS64_FACTOR) >>> 0, Math.imul(keyB, CS64_FACTOR) >>> 0];
  const terms = CS64_COEFFICIENTS.map(([coeff], i) => Math.imul(coeff, factors[i % 2]) >>> 0);
  const offsets = CS64_COEFFICIENTS.map(([, off]) => off);
  const prefixed = new Uint8Array(data.length + 1);
  prefixed.set(data, 1); // leidende nulbyte, zoals in de referentie
  wordsLe4Even(prefixed).forEach((word, i) => {
    let term = Math.imul(word, i % 2 === 0 ? keyA : keyB);
    let offset = Math.imul(rol16(word), i % 2 === 0 ? 0xEF0569FB : 0xC31713DB);
    if (i === 0) {
      term = (term + Math.imul(CS64_ADJUSTMENT0, factors[0])) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  });
  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16((offsets[i] + x) >>> 0);
    let q = Math.imul(t, 0x76F50F34) >>> 0;
    swapAcc = (swapAcc + ((Math.imul(rol16(q), 0xC3EFEA97) + q) >>> 0)) >>> 0;
    t = rol16((offsets[i + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881CE3C) >>> 0;
    swapLast = (Math.imul(rol16(q), 0x35BD1EC9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = Math.imul(state, keyA) >>> 0;
    state = (state + x) >>> 0;
    state = Math.imul(rol16(state), 0xCF98B111) >>> 0;
    state = Math.imul(rol16(state), 0x87085B9F) >>> 0;
    state = Math.imul(rol16(state), 0x12CEB96D) >>> 0;
    state = Math.imul(rol16(state), 0x257E1D83) >>> 0;
    acc = (acc + state) >>> 0;
    t = (Math.imul(state, keyB) + y) >>> 0;
    t = Math.imul(rol16(t), 0xA27416F5) >>> 0;
    t = Math.imul(rol16(t), 0xD38396FF) >>> 0;
    state = Math.imul(rol16(Math.imul(rol16(t), 0x7C932B89) >>> 0), 0xBFA49F69) >>> 0;
    acc = (acc + state) >>> 0;
  }
  return [swapLast ^ state, swapAcc ^ acc];
}

function bytesToHexUpper(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function computeSecMsGec(nowMs = Date.now()) {
  let ticks = Math.floor(nowMs / 1000) + WIN_EPOCH_SECONDS;
  ticks -= ticks % 300; // afronden naar 5-minutenvenster
  const input = `${BigInt(ticks) * 10_000_000n}${TRUSTED_CLIENT_TOKEN}`;
  const data = new TextEncoder().encode(input);
  const digest = sha256DigestCustom(data);
  const [c1, c2] = cs64Digest(data, digest);
  const cs64 = new Uint8Array(8);
  const cv = new DataView(cs64.buffer);
  cv.setUint32(0, c1, true);
  cv.setUint32(4, c2, true);
  return `${bytesToHexUpper(cs64)}-${bytesToHexUpper(digest)}`;
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
