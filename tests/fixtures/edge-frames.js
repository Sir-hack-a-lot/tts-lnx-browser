// Helpers om Edge TTS protocol-frames na te bouwen in tests.
export function buildTextFrame(path, body) {
  return `X-RequestId:abc123\r\nContent-Type:application/json; charset=utf-8\r\nPath:${path}\r\n\r\n${body}`;
}

export function buildBinaryFrame(path, payload) {
  const header = new TextEncoder().encode(`X-RequestId:abc123\r\nPath:${path}\r\n\r\n`);
  const buf = new Uint8Array(2 + header.length + payload.length);
  new DataView(buf.buffer).setUint16(0, header.length); // big-endian headerlengte
  buf.set(header, 2);
  buf.set(payload, 2 + header.length);
  return buf.buffer;
}
