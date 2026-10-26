"""Tests voor de piper-engine. Piper zelf wordt gemockt — geen echt stemmodel
en geen netwerkcalls in tests."""

import pytest

from tts_lnx_helper import piper_engine


def test_rate_naar_length_scale():
    assert piper_engine.length_scale(1.0) == 1.0
    assert piper_engine.length_scale(2.0) == 0.5
    assert piper_engine.length_scale(0.5) == 2.0
    assert piper_engine.length_scale(9.0) == 0.5   # clamp


def test_synthesize_geeft_wav_zonder_boundaries(monkeypatch, tmp_path):
    # Fake volgt de echte piper-tts 1.x API: voice.synthesize(text, syn_config)
    # yieldt AudioChunk-achtige objecten met audio_int16_bytes + sample_rate.
    class FakeVoice:
        def __init__(self):
            self.gezien_syn_config = None

        def synthesize(self, text, syn_config=None):
            self.gezien_syn_config = syn_config
            yield FakeChunk()

    class FakeChunk:
        audio_int16_bytes = b"\x00\x01" * 100
        sample_rate = 22050
        sample_width = 2
        sample_channels = 1

    fake = FakeVoice()
    monkeypatch.setattr(piper_engine, "ensure_voice", lambda v: tmp_path / "x.onnx")
    monkeypatch.setattr(piper_engine, "load_voice", lambda p: fake)
    wav, boundaries = piper_engine.synthesize("Hallo.", "nl_NL-mls-medium", 1.5)
    assert wav[:4] == b"RIFF"
    assert boundaries == []
    # rate 1.5 -> length_scale 2/3 wordt doorgegeven aan piper
    assert fake.gezien_syn_config is not None
    assert fake.gezien_syn_config.length_scale == pytest.approx(1 / 1.5)


def test_synthesize_zonder_chunks_geeft_lege_wav(monkeypatch, tmp_path):
    # Lege tekst -> nul chunks; synthesize mag dan geen wave.Error gooien
    # maar moet een valide (lege) WAV teruggeven.
    class StilleStem:
        def synthesize(self, text, syn_config=None):
            return iter([])

    monkeypatch.setattr(piper_engine, "ensure_voice", lambda v: tmp_path / "x.onnx")
    monkeypatch.setattr(piper_engine, "load_voice", lambda p: StilleStem())
    wav, boundaries = piper_engine.synthesize("", "nl_NL-mls-medium", 1.0)
    assert wav[:4] == b"RIFF"
    assert boundaries == []


def test_fetch_gebruikt_timeout(monkeypatch):
    # _fetch moet urlopen met een eindige timeout aanroepen (geen onbeperkt hangen).
    gezien = {}

    class FakeAntwoord:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b"data"

    def fake_urlopen(url, timeout=None):
        gezien["timeout"] = timeout
        return FakeAntwoord()

    monkeypatch.setattr(piper_engine.urllib.request, "urlopen", fake_urlopen)
    assert piper_engine._fetch("https://voorbeeld.test/x") == b"data"
    assert gezien["timeout"] == piper_engine.DOWNLOAD_TIMEOUT


def test_ensure_voice_downloadt_ontbrekende_bestanden(monkeypatch, tmp_path):
    # Geen netwerk: _fetch wordt vervangen door een vaste bytes-teruggever.
    opgehaald = []

    def fake_fetch(url):
        opgehaald.append(url)
        return b"inhoud-van-" + url.rsplit("/", 1)[-1].encode()

    monkeypatch.setattr(piper_engine, "VOICE_DIR", tmp_path)
    monkeypatch.setattr(piper_engine, "_fetch", fake_fetch)

    pad = piper_engine.ensure_voice("nl_NL-mls-medium")

    assert pad == tmp_path / "nl_NL-mls-medium.onnx"
    assert (tmp_path / "nl_NL-mls-medium.onnx").read_bytes() == b"inhoud-van-nl_NL-mls-medium.onnx"
    assert (tmp_path / "nl_NL-mls-medium.onnx.json").read_bytes() == b"inhoud-van-nl_NL-mls-medium.onnx.json"
    assert len(opgehaald) == 2
    # Geen .tmp-restanten na atomische rename
    assert list(tmp_path.glob("*.tmp")) == []


def test_ensure_voice_slaat_download_over_als_bestanden_er_zijn(monkeypatch, tmp_path):
    (tmp_path / "nl_NL-mls-medium.onnx").write_bytes(b"al-aanwezig")
    (tmp_path / "nl_NL-mls-medium.onnx.json").write_bytes(b"{}")

    def mag_niet_gebeuren(url):  # pragma: no cover - bewakingsfunctie
        raise AssertionError("download ondanks aanwezige bestanden")

    monkeypatch.setattr(piper_engine, "VOICE_DIR", tmp_path)
    monkeypatch.setattr(piper_engine, "_fetch", mag_niet_gebeuren)

    pad = piper_engine.ensure_voice("nl_NL-mls-medium")
    assert pad.read_bytes() == b"al-aanwezig"
