"""Piper TTS-engine: lokale synthese met piper-tts (onnx), geen netwerk nodig
zodra het stemmodel eenmaal gedownload is.

Levert WAV-bytes en een lege boundaries-lijst (piper geeft geen
woordtijdstempels), volgens hetzelfde (audio, boundaries)-contract als
edge_engine.synthesize.

VOICE_DIR is een module-constante maar wordt op aanroepmoment gelezen
(ledger Ruling 2): functies verwijzen naar de globale naam, dus tests kunnen
`monkeypatch.setattr(piper_engine, "VOICE_DIR", tmp_path)` gebruiken.
"""

import io
import urllib.request
import wave
from pathlib import Path

VOICE_DIR = Path.home() / ".local" / "share" / "tts-lnx-helper" / "voices"

DEFAULT_VOICES = {"nl": "nl_NL-mls-medium"}

# Download-basis: https://huggingface.co/rhasspy/piper-voices/resolve/main/
_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"

_voice_cache = {}


def length_scale(rate):
    """Tempo-naar-piper-vertaling: piper's length_scale is omgekeerd evenredig
    met rate, geclampt op 0.5-2.0 (zelfde clamp als de edge-engine)."""
    return 1 / min(2.0, max(0.5, rate))


def _voice_relpad(voice_id):
    """'nl_NL-mls-medium' -> 'nl/nl_NL/mls/medium/nl_NL-mls-medium'."""
    locale, rest = voice_id.split("-", 1)
    naam, kwaliteit = rest.rsplit("-", 1)
    taal = locale.split("_", 1)[0]
    return f"{taal}/{locale}/{naam}/{kwaliteit}/{voice_id}"


def _fetch(url):
    """Haal een URL op als bytes (urllib volgt redirects vanzelf)."""
    with urllib.request.urlopen(url) as antwoord:
        return antwoord.read()


def _sla_atomisch_op(pad, data):
    """Eerst naar .tmp schrijven, dan rename: geen half-gedownloade modellen."""
    tmp = pad.with_suffix(pad.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.rename(pad)


def ensure_voice(voice_id):
    """Zorg dat `<voice_id>.onnx` + `.onnx.json` in VOICE_DIR staan en geef het
    pad naar het .onnx-bestand terug. Downloadt alleen wat ontbreekt."""
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    onnx_pad = VOICE_DIR / f"{voice_id}.onnx"
    json_pad = VOICE_DIR / f"{voice_id}.onnx.json"
    basis = f"{_HF_BASE}/{_voice_relpad(voice_id)}"
    if not onnx_pad.exists():
        _sla_atomisch_op(onnx_pad, _fetch(f"{basis}.onnx"))
    if not json_pad.exists():
        _sla_atomisch_op(json_pad, _fetch(f"{basis}.onnx.json"))
    return onnx_pad


def load_voice(model_pad):
    """Laad een PiperVoice en cache per modelpad (laden is duur)."""
    if model_pad not in _voice_cache:
        from piper import PiperVoice  # lazy: piper is een optionele extra
        _voice_cache[model_pad] = PiperVoice.load(model_pad)
    return _voice_cache[model_pad]


def synthesize(text, voice, rate):
    """Synthetiseer `text` met piper-stem `voice` en tempo `rate`.

    Geeft (wav-bytes, []) — piper levert geen word-boundaries. Alle chunks
    worden in geheugen tot één WAV samengevoegd; er wordt geen paginatekst of
    audio naar schijf geschreven (alleen het stemmodel zelf staat op schijf).
    """
    from piper.config import SynthesisConfig  # lazy: piper is een optionele extra
    stem = load_voice(ensure_voice(voice))
    config = SynthesisConfig(length_scale=length_scale(rate))

    buffer = io.BytesIO()
    eerste_chunk = True
    with wave.open(buffer, "wb") as wav:
        for chunk in stem.synthesize(text, syn_config=config):
            if eerste_chunk:
                # WAV-header volgt de eigenschappen van de eerste chunk.
                wav.setnchannels(chunk.sample_channels)
                wav.setsampwidth(chunk.sample_width)
                wav.setframerate(chunk.sample_rate)
                eerste_chunk = False
            wav.writeframes(chunk.audio_int16_bytes)
    return buffer.getvalue(), []
