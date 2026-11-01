"""Edge TTS websocket-engine: Python-port van de JS-engine in
extension/background/engines/edge-tts.js + edge-protocol.js.

Spreekt het onofficiële readaloud-protocol van Microsoft Edge: verbinden met
Sec-MS-GEC v2-token, speech.config + SSML sturen, daarna frames lezen tot
turn.end. Binaire frames met Path:audio leveren mp3-bytes, tekstframes met
Path:audio.metadata leveren word-boundaries (offsets in 100ns-eenheden).
"""

import asyncio
import json
import re
import secrets
import struct
from datetime import datetime, timezone
from urllib.parse import quote
from xml.sax.saxutils import escape

import websockets
import websockets.exceptions

from tts_lnx_helper.edge_constants import (
    EDGE_USER_AGENT,
    OUTPUT_FORMAT,
    SEC_MS_GEC_VERSION,
    TRUSTED_CLIENT_TOKEN,
)
from tts_lnx_helper.gec import compute_sec_ms_gec

WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
DEFAULT_TIMEOUT = 15.0


def generate_connection_id():
    """32 hex-karakters (uuid zonder streepjes)."""
    return secrets.token_hex(16)


def _timestamp():
    # Zelfde rol als new Date().toISOString() in de JS-versie.
    return datetime.now(timezone.utc).isoformat()


def build_wss_url(connection_id, sec_ms_gec):
    return (WSS_URL
            + f'?TrustedClientToken={TRUSTED_CLIENT_TOKEN}'
            + f'&Sec-MS-GEC={sec_ms_gec}'
            + f'&Sec-MS-GEC-Version={quote(SEC_MS_GEC_VERSION)}'
            + f'&ConnectionId={connection_id}')


def build_config_message():
    config = {'context': {'synthesis': {'audio': {
        'metadataoptions': {'sentenceBoundaryEnabled': 'false', 'wordBoundaryEnabled': 'true'},
        'outputFormat': OUTPUT_FORMAT,
    }}}}
    return (f'X-Timestamp:{_timestamp()}\r\n'
            'Content-Type:application/json; charset=utf-8\r\n'
            'Path:speech.config\r\n\r\n'
            + json.dumps(config))


def rate_to_pct(rate):
    """rate 1.0 -> '+0%'; geclampt op 0.5-2.0 zoals rateToPct in de JS-versie."""
    clamped = min(2.0, max(0.5, rate))
    pct = round((clamped - 1) * 100)
    return f"{'+' if pct >= 0 else ''}{pct}%"


def build_ssml_message(text, voice, rate_pct, request_id):
    escaped = escape(text, {'"': '&quot;', "'": '&apos;'})
    ssml = ("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='nl-NL'>"
            f"<voice name='{voice}'><prosody pitch='+0Hz' rate='{rate_pct}' volume='+0%'>"
            f'{escaped}</prosody></voice></speak>')
    return (f'X-RequestId:{request_id}\r\n'
            'Content-Type:application/ssml+xml\r\n'
            f'X-Timestamp:{_timestamp()}\r\n'
            f'Path:ssml\r\n\r\n{ssml}')


_PATH_RE = re.compile(r'Path:([^\r\n]+)')


def parse_text_frame(frame):
    """Tekstframe: headers en body gescheiden door een lege regel."""
    headers, _, body = frame.partition('\r\n\r\n')
    match = _PATH_RE.search(headers)
    return (match.group(1) if match else ''), body


def parse_binary_frame(frame):
    """Binair frame: 2 bytes big-endian headerlengte, dan ascii-headers, dan payload."""
    header_len = struct.unpack('>H', frame[:2])[0]
    header_text = frame[2:2 + header_len].decode('utf-8')
    match = _PATH_RE.search(header_text)
    return (match.group(1) if match else ''), frame[2 + header_len:]


def extract_word_boundaries(body):
    """WordBoundary-metadata: Offset/Duration in 100ns-eenheden -> milliseconden."""
    try:
        parsed = json.loads(body)
    except ValueError:
        return []
    boundaries = []
    for meta in parsed.get('Metadata', []):
        data = meta.get('Data') or {}
        text = (data.get('text') or {}).get('Text')
        if meta.get('Type') == 'WordBoundary' and text is not None:
            boundaries.append({
                'text': text,
                'offsetMs': round(data['Offset'] / 10000),
                'durationMs': round(data['Duration'] / 10000),
            })
    return boundaries


async def _lees_frames(ws, audio_parts, boundaries):
    while True:
        frame = await ws.recv()
        if isinstance(frame, str):
            path, body = parse_text_frame(frame)
            if path == 'audio.metadata':
                boundaries.extend(extract_word_boundaries(body))
            elif path == 'turn.end':
                return
        else:
            path, payload = parse_binary_frame(bytes(frame))
            if path == 'audio':
                audio_parts.append(payload)
            elif path == 'turn.end':
                return


async def synthesize(text, voice, rate, ws_factory=None, timeout=DEFAULT_TIMEOUT):
    """Synthetiseer `text` met stem `voice` en tempo `rate` via de Edge-dienst.

    Geeft (mp3-bytes, boundaries) met boundaries als
    [{'text', 'offsetMs', 'durationMs'}].

    Injectiepunten voor tests (geen echt netwerk nodig):
    - ws_factory: callable (url, additional_headers=...) die een async context
      manager met send()/recv() teruggeeft; standaard websockets.connect.
    - timeout: maximale duur van de hele synthese in seconden (standaard 15).

    Fouten: RuntimeError('Edge TTS timeout') bij timeout,
    RuntimeError('Edge TTS websocket-fout') bij verbindingsfouten.
    """
    if ws_factory is None:
        ws_factory = websockets.connect
    url = build_wss_url(generate_connection_id(), compute_sec_ms_gec())
    request_id = generate_connection_id()
    try:
        return await asyncio.wait_for(
            _synthese_ronde(ws_factory, url, request_id, text, voice, rate), timeout)
    except TimeoutError:
        raise RuntimeError('Edge TTS timeout') from None
    except (websockets.exceptions.WebSocketException, OSError) as exc:
        raise RuntimeError('Edge TTS websocket-fout') from exc


async def _synthese_ronde(ws_factory, url, request_id, text, voice, rate):
    audio_parts = []
    boundaries = []
    async with ws_factory(url, additional_headers={'User-Agent': EDGE_USER_AGENT}) as ws:
        await ws.send(build_config_message())
        await ws.send(build_ssml_message(text, voice, rate_to_pct(rate), request_id))
        await _lees_frames(ws, audio_parts, boundaries)
    return b''.join(audio_parts), boundaries
