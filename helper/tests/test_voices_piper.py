import urllib.error

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
    monkeypatch.setattr(server, "piper_beschikbaar", lambda: True)
    monkeypatch.setattr(server.piper_engine, "synthesize",
                        lambda t, v, r: (b"WAV", []))
    client = TestClient(server.create_app())
    r = client.post("/synthesize", json={
        "text": "Hallo.", "voice": "nl_NL-mls-medium", "rate": 1.0, "engine": "piper"})
    assert r.status_code == 200
    assert r.json()["format"] == "wav"
    assert r.json()["boundaries"] == []


def test_synthesize_piper_downloadfout_geeft_503(monkeypatch):
    def download_fout(t, v, r):
        raise urllib.error.URLError("netwerk onbereikbaar")

    monkeypatch.setattr(server, "piper_beschikbaar", lambda: True)
    monkeypatch.setattr(server.piper_engine, "synthesize", download_fout)
    client = TestClient(server.create_app())
    r = client.post("/synthesize", json={
        "text": "Hallo.", "voice": "nl_NL-mls-medium", "rate": 1.0, "engine": "piper"})
    assert r.status_code == 503


def test_synthesize_piper_synthesefout_geeft_502(monkeypatch):
    def synthese_fout(t, v, r):
        raise RuntimeError("piper crashte")

    monkeypatch.setattr(server, "piper_beschikbaar", lambda: True)
    monkeypatch.setattr(server.piper_engine, "synthesize", synthese_fout)
    client = TestClient(server.create_app())
    r = client.post("/synthesize", json={
        "text": "Hallo.", "voice": "nl_NL-mls-medium", "rate": 1.0, "engine": "piper"})
    assert r.status_code == 502


def test_voices_zonder_voice_dir_geeft_alleen_edge(monkeypatch, tmp_path):
    # VOICE_DIR bestaat niet: geen crash, alleen de statische Edge-stemmen.
    monkeypatch.setattr(piper_engine, "VOICE_DIR", tmp_path / "bestaat-niet")
    client = TestClient(server.create_app())
    r = client.get("/voices")
    assert r.status_code == 200
    voices = r.json()
    assert len(voices) > 0
    assert all(v["engine"] == "edge" for v in voices)
