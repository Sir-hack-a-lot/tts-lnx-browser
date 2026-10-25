"""Tests voor de Edge-engine met een nep-websocket: geen echt netwerkverkeer.

De FakeWS legt de handshake (url + additional_headers) en de verzonden
berichten vast en speelt een vooraf ingeplande reeks frames af via recv().
"""

import asyncio
import json
import re
import struct

import pytest

from tts_lnx_helper.edge_constants import EDGE_USER_AGENT, OUTPUT_FORMAT, TRUSTED_CLIENT_TOKEN
from tts_lnx_helper.edge_engine import synthesize


class FakeWS:
    """Minimale nep-websocket voor de engine (async context manager met
    send/recv, dezelfde vorm als websockets.connect())."""

    def __init__(self, url, frames, additional_headers=None):
        self.url = url
        self.additional_headers = additional_headers or {}
        self.frames = list(frames)
        self.sent = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def send(self, msg):
        self.sent.append(msg)

    async def recv(self):
        await asyncio.sleep(0)
        frame = self.frames.pop(0)
        if isinstance(frame, Exception):
            raise frame
        return frame


def maak_factory(frames, opslag):
    """ws_factory zoals synthesize() hem aanroept; de FakeWS belandt in `opslag`."""
    def factory(url, additional_headers=None):
        ws = FakeWS(url, frames, additional_headers=additional_headers)
        opslag.append(ws)
        return ws
    return factory


def metadata_frame():
    meta = {"Metadata": [{"Type": "WordBoundary", "Data": {
        "text": {"Text": "Hallo"}, "Offset": 5_000_000, "Duration": 3_000_000}}]}
    return "Path:audio.metadata\r\n\r\n" + json.dumps(meta)


def audio_frame(payload=b"MP3DATA"):
    header = b"Path:audio\r\n"
    return struct.pack(">H", len(header)) + header + payload


TURN_END = "Path:turn.end\r\n\r\n"


def run_synthesize(frames, text="Hallo wereld.", rate=1.0, **kwargs):
    opslag = []
    result = asyncio.run(synthesize(text, "nl-NL-MaartenNeural", rate,
                                    ws_factory=maak_factory(frames, opslag), **kwargs))
    return result, opslag[0]


def test_synthesize_levert_audio_en_boundaries():
    (audio, boundaries), _ws = run_synthesize([metadata_frame(), audio_frame(), TURN_END])
    assert audio == b"MP3DATA"
    # Offset/Duration in 100ns-eenheden -> ms (afgerond).
    assert boundaries == [{"text": "Hallo", "offsetMs": 500, "durationMs": 300}]


def test_config_en_ssml_worden_verstuurd():
    _, ws = run_synthesize([metadata_frame(), audio_frame(), TURN_END])
    assert len(ws.sent) == 2
    config, ssml = ws.sent
    assert "Path:speech.config" in config
    assert '"wordBoundaryEnabled": "true"' in config or '"wordBoundaryEnabled":"true"' in config
    assert OUTPUT_FORMAT in config
    assert "Path:ssml" in ssml
    assert "Content-Type:application/ssml+xml" in ssml
    assert "X-RequestId:" in ssml
    assert "<voice name='nl-NL-MaartenNeural'>" in ssml
    assert "rate='+0%'" in ssml
    assert "Hallo wereld." in ssml


def test_handshake_url_en_edge_user_agent():
    _, ws = run_synthesize([TURN_END])
    assert "Sec-MS-GEC=" in ws.url
    assert "Sec-MS-GEC-Version=2-" in ws.url
    assert f"TrustedClientToken={TRUSTED_CLIENT_TOKEN}" in ws.url
    assert re.search(r"ConnectionId=[0-9a-f]{32}", ws.url)
    # De dienst weigert de handshake (403) zonder Edge-User-Agent.
    assert ws.additional_headers.get("User-Agent") == EDGE_USER_AGENT


def test_ssml_escapet_tekst():
    _, ws = run_synthesize([TURN_END], text="A & B <C> \"q\" 'a'")
    body = ws.sent[1]
    assert "A &amp; B &lt;C&gt; &quot;q&quot; &apos;a&apos;" in body
    assert "A & B" not in body


def test_rate_wordt_geclampt():
    _, ws = run_synthesize([TURN_END], rate=5.0)
    assert "rate='+100%'" in ws.sent[1]
    _, ws = run_synthesize([TURN_END], rate=0.1)
    assert "rate='-50%'" in ws.sent[1]


def test_turn_end_sluit_af_zonder_audio():
    audio, boundaries = asyncio.run(synthesize(
        "Hallo.", "nl-NL-MaartenNeural", 1.0,
        ws_factory=maak_factory([TURN_END], [])))
    assert audio == b""
    assert boundaries == []


def test_timeout_gooit_runtime_error():
    class HangendeWS(FakeWS):
        async def recv(self):
            await asyncio.sleep(3600)

    def factory(url, additional_headers=None):
        return HangendeWS(url, [], additional_headers=additional_headers)

    with pytest.raises(RuntimeError, match="Edge TTS timeout"):
        asyncio.run(synthesize("Hallo.", "nl-NL-MaartenNeural", 1.0,
                               ws_factory=factory, timeout=0.05))


def test_websocket_fout_wordt_runtime_error():
    with pytest.raises(RuntimeError, match="Edge TTS websocket-fout"):
        asyncio.run(synthesize("Hallo.", "nl-NL-MaartenNeural", 1.0,
                               ws_factory=maak_factory([OSError("verbinding weg")], [])))
