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
