// HTTP-client voor de lokale TTS-helper (FastAPI op 127.0.0.1:5020).
// De helper doet de eigenlijke synthese (Edge TTS / Piper); deze engine
// houdt hetzelfde contract aan als de oude edge-engine zodat player.js
// ongewijzigd blijft.

const MIME_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav' };

// Base64-string omzetten naar een Blob met het juiste audio-MIME-type.
function base64ToBlob(audioB64, format) {
  const bytes = Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: MIME_TYPES[format] ?? 'application/octet-stream' });
}

export function createHelperEngine({ fetchImpl = globalThis.fetch, baseUrl = 'http://127.0.0.1:5020' } = {}) {
  return {
    name: 'helper',
    isLocal: false,

    // Geeft de geparste /health-JSON terug, of null bij elke fout
    // (netwerkfout, timeout van 1 seconde, niet-OK status, kapotte JSON).
    async health() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      try {
        const res = await fetchImpl(`${baseUrl}/health`, { signal: controller.signal });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },

    async available() {
      return (await this.health()) !== null;
    },

    async synthesize({ text, voice, rate = 1, engine }) {
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, rate, engine }),
        });
      } catch (err) {
        // Netwerkfout: de helper draait niet of is onbereikbaar.
        throw new Error('helper-offline', { cause: err });
      }
      if (!res.ok) {
        // 502/503: de helper leeft, maar de upstream-engine faalde.
        // De helper stuurt de foutmelding mee als `detail` in de JSON-body.
        let detail = `helper-fout ${res.status}`;
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch { /* body was geen JSON; val terug op statuscode */ }
        throw new Error(detail);
      }
      const body = await res.json();
      return {
        audio: base64ToBlob(body.audio_b64, body.format),
        boundaries: body.boundaries ?? [],
      };
    },
  };
}
