# Fase 2: tts-lnx-helper (Edge-proxy + Piper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle TTS-synthese verloopt via een lokale Python-helper (127.0.0.1:5020) met twee engines — edge (proxy naar Edge TTS met Edge-User-Agent + Sec-MS-GEC v2) en piper (lokaal) — zodat de extensie weer werkt én een lokale/offline optie heeft.

**Architecture:** De extensie verliest zijn directe websocket-code en praat uitsluitend HTTP met de helper via een nieuwe `helper`-engine met dezelfde `synthesize({text, voice, rate}) → {audio, boundaries}`-interface. De helper is een pip-pakket `tts-lnx-helper` (FastAPI + uvicorn) in `helper/`. Engine-router kiest op basis van voorkeur + `/health`.

**Tech Stack:** Python 3.10+ (fastapi, uvicorn, websockets, piper-tts, pytest), Firefox WebExtension MV2 (bestaand), Vitest.

**Spec:** docs/superpowers/specs/2026-10-22-firefox-tts-extensie-design.md (herzien 2026-10-25)

**Bewust uitgesteld (spec §4.2 punt 3):** mid-sessie-failover (engine wisselt
halverwege een artikel bij een fout). Deze fase kiest de engine één keer per
sessie bij `START`; een engine-fout geeft een nette melding. Reden: failover
vereist her-synthese vanaf de huidige zin met een andere stem midden in een
artikel — beter eerst het basispad betrouwbaar.

## Global Constraints

- Comments/docs/commit messages in het **Nederlands**; code-identifiers Engels.
- Elke commit eindigt met: `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- Werk op branch `main` (solo-project). Commit per taak.
- Helper bindt **alleen** op `127.0.0.1`; schrijft nooit paginatekst naar schijf.
- Python-code: `helper/` map, package `tts_lnx_helper`, tests in `helper/tests/` (pytest).
- De extensie mag GEEN directe websocket naar Microsoft meer openen.
- Contract helper ↔ extensie: `POST /synthesize {text, voice, rate}` →
  `{audio_b64: str, format: "mp3"|"wav", boundaries: [{text, offsetMs, durationMs}]}`.
  Fout: HTTP 502 (engine faalde) of 503 (engine niet beschikbaar) met `{detail: str}`.
- GEC-regressievector (live-gevalideerd 2026-10-24, handshake 101):
  timestamp `1792875899368` ms →
  `7F74E35C69DF60B0-9069C6F7F6FE2ACADAACEA11451034FB2C42E3AB6E69A02D2EB03748AAC8E100`
- Edge-constanten (zie ook `extension/background/engines/edge-protocol.js` als referentie):
  `TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'`,
  `SEC_MS_GEC_VERSION = '2-143.0.3650.75'`,
  `EDGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'`,
  `OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'`.
- Python mag de upstream edge-tts bron NIET downloaden en uitvoeren (geblokkeerd door
  permissiebeleid); de GEC-port volgt onze eigen JS-port in `edge-protocol.js`.

---

### Task 1: Helper-scaffolding + /health

**Files:**
- Create: `helper/pyproject.toml`, `helper/tts_lnx_helper/__init__.py`, `helper/tts_lnx_helper/server.py`, `helper/tts_lnx_helper/__main__.py`
- Test: `helper/tests/test_health.py`

**Interfaces:**
- Produces: `create_app() -> FastAPI`; `GET /health` → `{"status": "ok", "engines": {"edge": true, "piper": bool}}` (piper false zolang Piper niet geïnstalleerd is); CLI `python -m tts_lnx_helper` start uvicorn op 127.0.0.1:5020.

- [ ] **Step 1: pyproject.toml**

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "tts-lnx-helper"
version = "0.2.0"
description = "Lokale TTS-helper voor de TTS LNX Browser Firefox-extensie (Edge-proxy + Piper)"
requires-python = ">=3.10"
dependencies = ["fastapi>=0.110", "uvicorn>=0.29", "websockets>=12"]

[project.optional-dependencies]
piper = ["piper-tts>=1.2"]
dev = ["pytest>=8", "httpx>=0.27"]

[project.scripts]
tts-lnx-helper = "tts_lnx_helper.__main__:main"

[tool.setuptools.packages.find]
where = ["."]
include = ["tts_lnx_helper*"]
```

- [ ] **Step 2: falende test**

`helper/tests/test_health.py`:

```python
from fastapi.testclient import TestClient
from tts_lnx_helper.server import create_app

def test_health_rapporteert_engines():
    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["engines"]["edge"] is True
    assert "piper" in body["engines"]
```

- [ ] **Step 3: draai test (rood)**

Run: `cd helper && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/python -m pytest tests/ -q`
Expected: FAIL (module bestaat niet)

- [ ] **Step 4: implementatie**

`tts_lnx_helper/server.py`:

```python
"""FastAPI-server van de helper. Bindt uitsluitend op 127.0.0.1 (zie __main__)."""
from fastapi import FastAPI


def piper_beschikbaar() -> bool:
    try:
        import piper  # noqa: F401
        return True
    except ImportError:
        return False


def create_app() -> FastAPI:
    app = FastAPI(title="tts-lnx-helper")

    @app.get("/health")
    def health():
        return {"status": "ok", "engines": {"edge": True, "piper": piper_beschikbaar()}}

    return app
```

`tts_lnx_helper/__main__.py`:

```python
"""CLI-entry: start de helper op 127.0.0.1:5020 (nooit extern bereikbaar)."""
import uvicorn

from .server import create_app


def main() -> None:
    uvicorn.run(create_app(), host="127.0.0.1", port=5020, log_level="warning")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: draai test (groen)** — zelfde pytest-commando.

- [ ] **Step 6: commit**

```bash
git add helper/
git commit -m "Helper-scaffolding: FastAPI-app met /health en CLI-entry

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Sec-MS-GEC v2 in Python

**Files:**
- Create: `helper/tts_lnx_helper/gec.py`
- Test: `helper/tests/test_gec.py`

**Interfaces:**
- Produces: `compute_sec_ms_gec(now_ms: int | None = None) -> str` — v2-token `"<16 hex>-<64 hex>"`.

- [ ] **Step 1: falende test met bevroren vector**

`helper/tests/test_gec.py`:

```python
import re
from tts_lnx_helper.gec import compute_sec_ms_gec

VECTOR_TS = 1792875899368  # 2026-10-24T21:04:59.368Z
VECTOR = "7F74E35C69DF60B0-9069C6F7F6FE2ACADAACEA11451034FB2C42E3AB6E69A02D2EB03748AAC8E100"


def test_v2_formaat():
    token = compute_sec_ms_gec(VECTOR_TS)
    assert re.fullmatch(r"[0-9A-F]{16}-[0-9A-F]{64}", token)


def test_venster_determinisme():
    a = compute_sec_ms_gec(VECTOR_TS)
    assert compute_sec_ms_gec(VECTOR_TS + 60_000) == a       # zelfde 5-min-venster
    assert compute_sec_ms_gec(VECTOR_TS + 6 * 60_000) != a   # volgend venster


def test_regressievector():
    # Bevroren token, live tegen de echte dienst geverifieerd (handshake 101).
    assert compute_sec_ms_gec(VECTOR_TS) == VECTOR
```

- [ ] **Step 2: draai test (rood)**

Run: `cd helper && .venv/bin/python -m pytest tests/test_gec.py -q`
Expected: FAIL (module bestaat niet)

- [ ] **Step 3: port van het algoritme**

Port `computeSecMsGec` uit `extension/background/engines/edge-protocol.js` (regels
"Sec-MS-GEC v2" t/m einde van die functie) naar zuivere Python in
`helper/tts_lnx_helper/gec.py`:

- Zelfde constanten (SHA256_STATE, SHA256_SCHEDULE, SHA256_ROUND_CONSTANTS,
  SHA256_ADJUSTMENT, SIGMA-adjustments, CS64_COEFFICIENTS, CS64_FACTOR,
  CS64_ADJUSTMENT0/1), zelfde functiestructuur (rol16, words_le4_even,
  sigma0/1, sha256_rounds, expand_schedule, sha256_init, sha256_digest_custom,
  cs64_digest).
- Python heeft vrije int-precisie: overal waar JS BigInt/`Math.imul` gebruikt,
  volstaat `(x * y) & 0xFFFFFFFF`. De `x * 0x100000001`-rotaties mogen als
  gewone ints (geen masker nodig vóór de shifts, zoals in de JS-port).
- `TRUSTED_CLIENT_TOKEN` komt in een gedeelde `helper/tts_lnx_helper/edge_constants.py`
  samen met `SEC_MS_GEC_VERSION`, `EDGE_USER_AGENT` en `OUTPUT_FORMAT`
  (waarden: zie Global Constraints).
- ticks: `t = now_ms // 1000 + 11644473600; t -= t % 300; ticks = t * 10_000_000`;
  input-string `f"{ticks}{TRUSTED_CLIENT_TOKEN}"` als ascii-bytes.

- [ ] **Step 4: draai test (groen)** — alle drie de tests moeten slagen, vooral de vector.

- [ ] **Step 5: commit**

```bash
git add helper/
git commit -m "Sec-MS-GEC v2 (CS64+SHA-256) geport naar Python, met bevroren live-vector

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Edge-engine in de helper

**Files:**
- Create: `helper/tts_lnx_helper/edge_engine.py`
- Test: `helper/tests/test_edge_engine.py`

**Interfaces:**
- Consumes: `compute_sec_ms_gec` (Task 2), constanten uit `edge_constants.py`.
- Produces: `async def synthesize(text: str, voice: str, rate: float) -> tuple[bytes, list[dict]]` —
  geeft (mp3-bytes, boundaries `[{text, offsetMs, durationMs}]`). Injecteerbaar:
  `synthesize(text, voice, rate, ws_factory=...)` voor tests.

- [ ] **Step 1: falende test met fake-websocket**

`helper/tests/test_edge_engine.py`:

```python
import asyncio
import json
import struct

from tts_lnx_helper.edge_engine import synthesize
from tts_lnx_helper.edge_constants import EDGE_USER_AGENT


class FakeWS:
    """Minimale fake: ontvangt config+ssml, stuurt metadata + audio + turn.end."""

    def __init__(self, url, extra_headers=None):
        self.url = url
        self.extra_headers = extra_headers or {}
        self.sent = []

    async def send(self, msg):
        self.sent.append(msg)

    async def recv(self):
        # Eerste recv: word-boundary-metadata; tweede: audio; derde: turn.end.
        idx = len(self.sent) - 2  # na twee sends begint het antwoordverkeer
        await asyncio.sleep(0)
        if idx == 0:
            meta = {"Metadata": [{"Type": "WordBoundary", "Data": {
                "text": {"Text": "Hallo"}, "Offset": 5_000_000, "Duration": 3_000_000}}]}
            return "X-RequestId:abc\r\nPath:audio.metadata\r\nContent-Type:application/json\r\n\r\n" + json.dumps(meta)
        if idx == 1:
            header = b"X-RequestId:abc\r\nPath:audio\r\n"
            return struct.pack(">H", len(header)) + header + b"MP3DATA"
        raise TurnEnd()


class TurnEnd(Exception):
    pass


def maak_ws(url, **kw):
    return FakeWS(url, **kw)


def test_synthesize_levert_audio_en_boundaries():
    async def run():
        ws = maak_ws("wss://x")
        # recv-override: na metadata+audio expliciet turn.end-frame
        frames = []

        async def recv():
            await asyncio.sleep(0)
            frames.append(1)
            if len(frames) == 1:
                meta = {"Metadata": [{"Type": "WordBoundary", "Data": {
                    "text": {"Text": "Hallo"}, "Offset": 5_000_000, "Duration": 3_000_000}}]}
                return "Path:audio.metadata\r\n\r\n" + json.dumps(meta)
            if len(frames) == 2:
                header = b"Path:audio\r\n"
                return struct.pack(">H", len(header)) + header + b"MP3DATA"
            return "Path:turn.end\r\n\r\n"

        ws.recv = recv
        return await synthesize("Hallo wereld.", "nl-NL-MaartenNeural", 1.0,
                                ws_factory=lambda *a, **k: ws)

    audio, boundaries = asyncio.run(run())
    assert audio == b"MP3DATA"
    assert boundaries == [{"text": "Hallo", "offsetMs": 500, "durationMs": 300}]


def test_handshake_stuurt_edge_user_agent():
    ws = maak_ws("wss://x")
    assert "Sec-MS-GEC=" in ws.url and "Sec-MS-GEC-Version=2-" in ws.url
```

Pas de test aan op de uiteindelijke vorm van `ws_factory` (aangemaakt met
`websockets.connect(url, additional_headers={"User-Agent": EDGE_USER_AGENT})`);
de fake moet die headers vastleggen. Kies de simpelste injectievorm en leg die
vast in de docstring van `synthesize`.

- [ ] **Step 2: draai test (rood)**

Run: `cd helper && .venv/bin/python -m pytest tests/test_edge_engine.py -q`

- [ ] **Step 3: implementatie**

`helper/tts_lnx_helper/edge_engine.py` — zelfde protocol als de oude
`extension/background/engines/edge-tts.js` (referentie, mag verwijderd worden
in Task 8):

- URL: `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`
  + query `TrustedClientToken`, `Sec-MS-GEC` (Task 2), `Sec-MS-GEC-Version`,
  `ConnectionId` (32 hex via `secrets.token_hex(16)`).
- Verbind met `websockets.connect(url, additional_headers={"User-Agent": EDGE_USER_AGENT})`.
- Stuur speech.config-bericht (wordBoundaryEnabled true, outputFormat uit
  constanten) en daarna het SSML-bericht (zelfde opbouw als de JS-versie:
  `X-RequestId`, `Content-Type:application/ssml+xml`, `Path:ssml`, prosody
  rate als percentage, XML-escaping van de tekst).
- Lees frames tot `turn.end`: tekstframes met `Path:audio.metadata` →
  boundaries (Offset/Duration in 100ns → ms, afronden); binaire frames met
  `Path:audio` → bytes verzamelen.
- Timeout 15 s → `RuntimeError("Edge TTS timeout")`; websocket-fout →
  `RuntimeError("Edge TTS websocket-fout")`.
- rate → percentage: clamp 0.5–2.0, `+0%`-formaat zoals `rateToPct` in JS.

- [ ] **Step 4: draai test (groen)**

- [ ] **Step 5: commit**

```bash
git add helper/
git commit -m "Edge-engine in helper: websocket-synthese met Edge-UA en v2-token

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: /synthesize-endpoint (edge-route)

**Files:**
- Modify: `helper/tts_lnx_helper/server.py`
- Test: `helper/tests/test_synthesize_edge.py`

**Interfaces:**
- Consumes: `edge_engine.synthesize`.
- Produces: `POST /synthesize {text, voice, rate}` → `{audio_b64, format: "mp3", boundaries}`;
  `RuntimeError` uit de engine → 502 `{detail}`.

- [ ] **Step 1: falende test**

```python
import base64
from fastapi.testclient import TestClient
import tts_lnx_helper.server as server


def test_synthesize_edge(monkeypatch):
    async def fake_synth(text, voice, rate):
        assert voice == "nl-NL-MaartenNeural"
        return b"MP3", [{"text": "Hallo", "offsetMs": 0, "durationMs": 300}]

    monkeypatch.setattr(server.edge_engine, "synthesize", fake_synth)
    client = TestClient(server.create_app())
    r = client.post("/synthesize", json={
        "text": "Hallo.", "voice": "nl-NL-MaartenNeural", "rate": 1.0, "engine": "edge"})
    assert r.status_code == 200
    body = r.json()
    assert base64.b64decode(body["audio_b64"]) == b"MP3"
    assert body["format"] == "mp3"
    assert body["boundaries"][0]["offsetMs"] == 0


def test_synthesize_engine_fout_geeft_502(monkeypatch):
    async def fout(text, voice, rate):
        raise RuntimeError("Edge TTS websocket-fout")

    monkeypatch.setattr(server.edge_engine, "synthesize", fout)
    client = TestClient(server.create_app())
    r = client.post("/synthesize", json={
        "text": "Hallo.", "voice": "nl-NL-MaartenNeural", "rate": 1.0, "engine": "edge"})
    assert r.status_code == 502
    assert "websocket-fout" in r.json()["detail"]
```

- [ ] **Step 2: draai test (rood)** — `cd helper && .venv/bin/python -m pytest tests/test_synthesize_edge.py -q`

- [ ] **Step 3: implementatie** — in `server.py`:

```python
import base64
from fastapi import HTTPException
from pydantic import BaseModel
from . import edge_engine


class SynthesizeRequest(BaseModel):
    text: str
    voice: str
    rate: float = 1.0
    engine: str = "edge"


# in create_app():
    @app.post("/synthesize")
    async def synthesize(req: SynthesizeRequest):
        if req.engine != "edge":
            raise HTTPException(503, f"engine '{req.engine}' niet beschikbaar")
        try:
            audio, boundaries = await edge_engine.synthesize(req.text, req.voice, req.rate)
        except RuntimeError as e:
            raise HTTPException(502, str(e))
        return {"audio_b64": base64.b64encode(audio).decode(),
                "format": "mp3", "boundaries": boundaries}
```

- [ ] **Step 4: draai test (groen)**

- [ ] **Step 5: commit**

```bash
git add helper/
git commit -m "/synthesize-endpoint met edge-route (base64-audio + boundaries)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Piper-engine in de helper

**Files:**
- Create: `helper/tts_lnx_helper/piper_engine.py`
- Test: `helper/tests/test_piper_engine.py`

**Interfaces:**
- Produces:
  - `VOICE_DIR = ~/.local/share/tts-lnx-helper/voices/`
  - `DEFAULT_VOICES = {"nl": "nl_NL-mls-medium"}` (download-basis:
    `https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/`)
  - `ensure_voice(voice_id: str) -> Path` — download `.onnx` + `.onnx.json` indien afwezig
  - `synthesize(text: str, voice: str, rate: float) -> tuple[bytes, list]` — WAV-bytes, lege boundaries
  - rate → `length_scale = 1 / clamp(rate, 0.5, 2.0)`

- [ ] **Step 1: falende test** (Piper zelf mocken — geen echt model in tests):

```python
from tts_lnx_helper import piper_engine


def test_rate_naar_length_scale():
    assert piper_engine.length_scale(1.0) == 1.0
    assert piper_engine.length_scale(2.0) == 0.5
    assert piper_engine.length_scale(0.5) == 2.0
    assert piper_engine.length_scale(9.0) == 0.5   # clamp


def test_synthesize_geeft_wav_zonder_boundaries(monkeypatch, tmp_path):
    class FakeVoice:
        def synthesize(self, text, syn_config=None):
            yield FakeChunk()

    class FakeChunk:
        audio_int16_bytes = b"\x00\x01" * 100
        sample_rate = 22050
        sample_width = 2
        sample_channels = 1

    monkeypatch.setattr(piper_engine, "ensure_voice", lambda v: tmp_path / "x.onnx")
    monkeypatch.setattr(piper_engine, "load_voice", lambda p: FakeVoice())
    wav, boundaries = piper_engine.synthesize("Hallo.", "nl_NL-mls-medium", 1.5)
    assert wav[:4] == b"RIFF"
    assert boundaries == []
```

Pas de fake aan op de werkelijke piper-tts 1.x API (`PiperVoice.load(path)` en
`voice.synthesize(text)` of `synthesize_wav` — lees de geïnstalleerde package
na `pip install piper-tts`; de test moet de ECHTE api-vorm volgen).

- [ ] **Step 2: draai test (rood)** — installeer eerst: `.venv/bin/pip install -e '.[dev,piper]'`

- [ ] **Step 3: implementatie**

- `length_scale(rate)`: `1 / min(2.0, max(0.5, rate))`.
- `ensure_voice`: maak VOICE_DIR aan; download `<id>.onnx` en `<id>.onnx.json`
  van de huggingface-URL (urllib, volg redirects); sla atomisch op
  (eerst `.tmp`, dan rename).
- `load_voice`: cache `PiperVoice.load()` per pad.
- `synthesize`: chunks samenvoegen tot één WAV in geheugen (`wave`-module),
  geen schrijf van paginatekst of audio naar schijf.

- [ ] **Step 4: draai test (groen)**

- [ ] **Step 5: commit**

```bash
git add helper/
git commit -m "Piper-engine: stem-download, WAV-synthese, length_scale-snelheid

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: /voices + piper-route + auto-download

**Files:**
- Modify: `helper/tts_lnx_helper/server.py`
- Test: `helper/tests/test_voices_piper.py`

**Interfaces:**
- `GET /voices` → `[{id, name, lang, engine}]`: statische Edge-lijst
  (minimaal nl-NL-MaartenNeural, nl-NL-FennaNeural, nl-NL-ColetteNeural,
  en-US-JennyNeural, en-GB-SoniaNeural, de-DE-ConradNeural, de-DE-KatjaNeural,
  fr-FR-DeniseNeural, fr-FR-HenriNeural, es-ES-ElviraNeural, es-ES-AlvaroNeural)
  plus geïnstalleerde Piper-stemmen uit VOICE_DIR.
- `POST /synthesize` met `engine: "piper"` → piper_engine.synthesize; stem
  ontbreekt → `ensure_voice` downloadt; download faalt → 503.
- Bij de EERSTE synthesize met engine piper wordt de NL-standaardstem
  automatisch gedownload (zit al in ensure_voice).

- [ ] **Step 1: falende test**

```python
def test_voices_bevat_edge_en_piper(monkeypatch, tmp_path):
    monkeypatch.setattr(piper_engine, "VOICE_DIR", tmp_path)
    (tmp_path / "nl_NL-mls-medium.onnx").write_bytes(b"x")
    (tmp_path / "nl_NL-mls-medium.onnx.json").write_text("{}")
    client = TestClient(server.create_app())
    r = client.get("/voices")
    voices = r.json()
    assert any(v["id"] == "nl-NL-MaartenNeural" and v["engine"] == "edge" for v in voices)
    assert any(v["id"] == "nl_NL-mls-medium" and v["engine"] == "piper" for v in voices)


def test_synthesize_piper_route(monkeypatch):
    monkeypatch.setattr(server.piper_engine, "synthesize",
                        lambda t, v, r: (b"WAV", []))
    client = TestClient(server.create_app())
    r = client.post("/synthesize", json={
        "text": "Hallo.", "voice": "nl_NL-mls-medium", "rate": 1.0, "engine": "piper"})
    assert r.status_code == 200
    assert r.json()["format"] == "wav"
    assert r.json()["boundaries"] == []
```

- [ ] **Step 2: draai test (rood)**

- [ ] **Step 3: implementatie** — `/voices` in server.py; piper-route in
  `/synthesize` (503 als piper-engine niet beschikbaar; 502 bij synthesefout).

- [ ] **Step 4: draai test (groen)**

- [ ] **Step 5: commit**

```bash
git add helper/
git commit -m "/voices-endpoint en piper-syntheseroute met auto-download

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Helper README + autostart-installer

**Files:**
- Create: `helper/README.md`, `helper/tts_lnx_helper/autostart.py`
- Test: `helper/tests/test_autostart.py`

**Interfaces:**
- Produces: `python -m tts_lnx_helper.autostart install|uninstall` schrijft/verwijdert
  `~/.config/autostart/tts-lnx-helper.desktop`.

- [ ] **Step 1: falende test**

```python
def test_install_schrijft_desktop_file(tmp_path, monkeypatch):
    monkeypatch.setattr(autostart, "AUTOSTART_DIR", tmp_path)
    autostart.install()
    content = (tmp_path / "tts-lnx-helper.desktop").read_text()
    assert "Exec=tts-lnx-helper" in content
    assert "X-GNOME-Autostart-enabled=true" in content
```

- [ ] **Step 2: draai test (rood)**

- [ ] **Step 3: implementatie** — autostart.py (desktop-entry schrijven/verwijderen)
  en helper/README.md:

```markdown
# tts-lnx-helper

Lokale TTS-helper voor de TTS LNX Browser Firefox-extensie.

## Installatie

    pipx install tts-lnx-helper
    tts-lnx-helper          # draaien op 127.0.0.1:5020

Optioneel automatisch starten bij inloggen:

    tts-lnx-helper-autostart install   # of: python -m tts_lnx_helper.autostart install

## Engines

- `edge` (standaard): proxy naar Edge TTS — mooiste stemmen, internet nodig,
  paginatekst gaat naar Microsoft.
- `piper`: volledig lokaal en offline. De Nederlandse stem
  (nl_NL-mls-medium) wordt bij eerste gebruik gedownload naar
  ~/.local/share/tts-lnx-helper/voices/.

## Privacy

De helper luistert alleen op 127.0.0.1 en schrijft geen paginatekst naar
schijf. Logregels bevatten geen inhoud.
```

- [ ] **Step 4: draai test (groen)**

- [ ] **Step 5: commit**

```bash
git add helper/
git commit -m "Helper README en autostart-installer (.desktop)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Extensie — helper-engine + verwijderen directe Edge-code

**Files:**
- Create: `extension/background/engines/helper-engine.js`
- Test: `tests/helper-engine.test.js`

(De oude Edge-bestanden worden in Task 10 verwijderd, zodra background.js
is omgezet — eerder verwijderen breekt de build.)

**Interfaces:**
- Produces: `createHelperEngine({ fetchImpl = globalThis.fetch, baseUrl = 'http://127.0.0.1:5020' } = {})`
  met `name: 'helper'`, `isLocal: false`, `available()` (GET /health, timeout 1s),
  `synthesize({text, voice, rate, engine})` → `{audio: Blob, boundaries}` —
  zelfde vorm als de oude edge-engine zodat player.js ongewijzigd blijft.
  Fouten: helper onbereikbaar → `Error('helper-offline')`; 502/503 → `Error(detail)`.

- [ ] **Step 1: falende test**

```javascript
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

  it('available() checkt /health', async () => {
    const engine = createHelperEngine({
      fetchImpl: () => okResponse({ status: 'ok', engines: { edge: true, piper: true } }),
    });
    expect(await engine.available()).toBe(true);
    const down = createHelperEngine({ fetchImpl: () => Promise.reject(new TypeError('x')) });
    expect(await down.available()).toBe(false);
  });
});
```

- [ ] **Step 2: draai test (rood)** — `npx vitest run tests/helper-engine.test.js`

- [ ] **Step 3: implementatie** — helper-engine.js (fetch POST, base64 → Blob via
  `Uint8Array.from(atob(...), c => c.charCodeAt(0))`), verwijder de vier oude
  Edge-bestanden. base64-decoding: blob-type uit `format` (`mp3` → `audio/mpeg`,
  `wav` → `audio/wav`).

- [ ] **Step 4: draai test (groen)** — let op: het verwijderen van edge-bestanden
  breekt `tests/background-lifecycle.test.js` (FakeWebSocket-import) en
  `tests/integration.test.js` NIET als die geen edge-modules importeren;
  background.js importeert edge-tts wel — die import wordt pas in Task 10
  vervangen, dus verwijder die bestanden pas mee in Task 10 OF pas background.js
  voorlopig mee aan. Kies: verwijder edge-tts.js/edge-protocol.js pas in Task 10;
  in deze taak alleen de nieuwe engine + tests.

- [ ] **Step 5: commit**

```bash
git add extension/background/engines/helper-engine.js tests/helper-engine.test.js
git commit -m "Helper-engine voor de extensie (HTTP naar 127.0.0.1:5020)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Extensie — engine-router

**Files:**
- Create: `extension/background/engine-router.js`
- Modify: `extension/shared/settings.js` (enginePref-waarden)
- Test: `tests/engine-router.test.js`, `tests/settings.test.js` (bijwerken)

**Interfaces:**
- Produces: `createRouter({ helperEngine, settings })` met
  `async pickEngine(lang)` → `{engine: 'edge'|'piper', synthesize}` of throw
  `Error('helper-offline')`. Logica:
  - helper offline → throw 'helper-offline'
  - pref `cloud` → edge; `local` → piper (503/afwezig → fout 'piper niet beschikbaar');
    `local-first` → piper als beschikbaar, anders edge.
- settings.DEFAULTS.enginePref: `'cloud'` (betekenis: Edge via helper).

- [ ] **Step 1: falende test**

```javascript
import { describe, it, expect } from 'vitest';
import { createRouter } from '../extension/background/engine-router.js';

const maak = (health, pref) => createRouter({
  helperEngine: {
    available: () => Promise.resolve(health !== null),
    health: () => Promise.resolve(health),
    synthesize: ({ engine }) => Promise.resolve({ engine }),
  },
  settings: { load: () => Promise.resolve({ enginePref: pref }) },
});

describe('engine-router', () => {
  it('cloud-pref kiest edge', async () => {
    const r = await maak({ engines: { edge: true, piper: true } }, 'cloud');
    expect((await r.synthesize({})).engine).toBe('edge');
  });
  it('local-pref kiest piper', async () => {
    const r = await maak({ engines: { edge: true, piper: true } }, 'local');
    expect((await r.synthesize({})).engine).toBe('piper');
  });
  it('local-first valt terug op edge zonder piper', async () => {
    const r = await maak({ engines: { edge: true, piper: false } }, 'local-first');
    expect((await r.synthesize({})).engine).toBe('edge');
  });
  it('helper offline gooit helper-offline', async () => {
    await expect(maak(null, 'cloud').then((r) => r.synthesize({}))).rejects.toThrow('helper-offline');
  });
});
```

De router geeft een dunne wrapper rond helperEngine.synthesize die `engine`
invult op basis van health + pref. Leg de exacte vorm vast in de docstring.

- [ ] **Step 2: draai test (rood)**

- [ ] **Step 3: implementatie** — engine-router.js + settings.DEFAULTS bijwerken
  (enginePref-commentaar Nederlands: `'cloud' | 'local' | 'local-first'`).

- [ ] **Step 4: draai test (groen)**

- [ ] **Step 5: commit**

```bash
git add extension/background/engine-router.js extension/shared/settings.js tests/
git commit -m "Engine-router: pref + helper-health kiest edge of piper

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: Extensie — background.js op helper + opruiming oude Edge-code

**Files:**
- Modify: `extension/background/background.js`, `extension/shared/messages.js` (geen wijziging verwacht), `extension/manifest.json` (host-permissie `http://127.0.0.1:5020/` toevoegen; `https://speech.platform.bing.com/` verwijderen)
- Delete: `extension/background/engines/edge-tts.js`, `extension/background/engines/edge-protocol.js`, `tests/edge-tts.test.js`, `tests/edge-protocol.test.js`, `tests/fixtures/edge-frames.js`
- Test: `tests/background-lifecycle.test.js` (FakeWebSocket verwijderen; helper-engine faken), `tests/integration.test.js` (helper-engine faken i.p.v. WebSocket)

**Interfaces:**
- background.js gebruikt `createHelperEngine()` + `createRouter()`;
  `resolveVoice(lang, overrides)` blijft, maar de voice-id's zijn engine-afhankelijk:
  de router bepaalt de engine, daarna kiest `resolveVoice` een passende stem
  (engine-prefix: edge-stemmen bevatten '-', piper '_' — zie voices.js Task 11).
- 'helper-offline'-fout → playerbar-melding:
  "Helper draait niet. Installeer met: pipx install tts-lnx-helper"

- [ ] **Step 1: pas de bestaande tests aan (rood)** — background-lifecycle en
  integration faken nu `globalThis.fetch` (helper-engine) i.p.v. WebSocket:
  succesvolle synthesize geeft base64-'MP3' + boundaries; `/health` geeft ok.

- [ ] **Step 2: draai tests (rood)**

- [ ] **Step 3: implementatie** — background.js: vervang `createEdgeEngine()` door
  router; foutpad helper-offline als event naar content.js (nieuwe meldingstekst in
  content.js: herken 'helper-offline' en toon installatie-instructie); manifest
  host-permissies wisselen; oude bestanden verwijderen.

- [ ] **Step 4: hele suite groen** — `npm test`

- [ ] **Step 5: commit**

```bash
git add -A extension tests
git commit -m "Extensie praat via helper; directe Edge-websocket verwijderd

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: Extensie — stemmen per engine + engine-keuze in opties

**Files:**
- Modify: `extension/shared/voices.js`, `extension/options/options.html`, `extension/options/options.js`
- Test: `tests/voices.test.js`, `tests/options.test.js`

**Interfaces:**
- voices.js: `VOICES` krijgt per stem `engine: 'edge'|'piper'` en piper-stemmen
  (nl_NL-mls-medium); `resolveVoice(lang, overrides, engine)` kiest alleen
  stemmen van de gevraagde engine.
- options: keuzelijst "Engine": cloud (Edge, mooiste stemmen) / lokaal (Piper,
  offline) / lokaal eerst met cloud-reserve; stemmenlijst per taal toont alleen
  stemmen van de gekozen engine; helper-statusregel (bereikbaar ja/nee via
  /health; piper-stemmen-aantal via /voices).

- [ ] **Step 1: falende tests** — resolveVoice filtert op engine; options-test:
  engine-keuze opslaan/laden via storage, statusregel met gefake'de fetch.

- [ ] **Step 2: draai tests (rood)**

- [ ] **Step 3: implementatie**

- [ ] **Step 4: tests groen**

- [ ] **Step 5: commit**

```bash
git add extension tests
git commit -m "Stemmen per engine en engine-keuze in de instellingen

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Contract- en eindtests

**Files:**
- Create: `helper/tests/test_contract.py`
- Test: `tests/contract.test.js`

**Interfaces:**
- Gedeeld contract (Global Constraints): zelfde JSON-vorm aan beide kanten.
- `helper/tests/test_contract.py`: TestClient → echte FastAPI-serialisatie
  (met gemockte engines) vergeleken met het vaste contractobject.
- `tests/contract.test.js`: helper-engine parsed hetzelfde vaste contractobject
  (gefakte fetch die de exacte JSON van de Python-test teruggeeft).
- Beide tests lezen hetzelfde fixturebestand `tests/fixtures/synthesize-response.json`:

```json
{
  "audio_b64": "TVAz",
  "format": "mp3",
  "boundaries": [{ "text": "Hallo", "offsetMs": 0, "durationMs": 300 }]
}
```

- [ ] **Step 1: falende tests aan beide kanten**
- [ ] **Step 2: draai (rood)**
- [ ] **Step 3: implementatie/fixture**
- [ ] **Step 4: groen** — `npm test` en `cd helper && .venv/bin/python -m pytest tests/ -q`
- [ ] **Step 5: commit**

```bash
git add helper tests
git commit -m "Contracttests: helper-response en extensie-parser delen fixture

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: README-update, packaging, smoke-checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README bijwerken** — nieuwe architectuur (helper vereist),
  installatie-instructies (pipx + helper starten + autostart), engine-keuze,
  privacy (cloud via helper → Microsoft; piper volledig lokaal), bijgewerkte
  bekende beperkingen (woord-highlighting alleen met edge-engine).

- [ ] **Step 2: build + package + lint** — `npm run build && npm run lint && npm run package`;
  `cd helper && .venv/bin/python -m pytest tests/ -q` en
  `.venv/bin/pip install build && .venv/bin/python -m build` (sdist/wheel bouwt).

- [ ] **Step 3: handmatige smoke-test (door gebruiker)**

1. `pipx install ./helper` (lokale install) en `tts-lnx-helper` starten.
2. `npm start` → nu.nl → werkbalkknop → Nederlands voorlezen met Edge-stem
   (via helper), zin- én woord-highlight.
3. Instellingen → engine "lokaal (Piper)" → opnieuw → Piper-stem (eerste keer:
   download van de NL-stem duurt even), zin-highlighting zonder woord.
4. Helper afsluiten → playerbar toont installatie-melding (geen crash).
5. Helper weer starten → werkt weer.

- [ ] **Step 4: commit + push**

```bash
git add README.md
git commit -m "README voor helper-architectuur (fase 2)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push origin main
```
