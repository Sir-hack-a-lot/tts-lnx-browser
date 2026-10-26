from fastapi.testclient import TestClient
import tts_lnx_helper.server as server
from tts_lnx_helper import piper_engine


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
