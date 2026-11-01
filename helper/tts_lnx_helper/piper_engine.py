"""Piper TTS-engine: lokale synthese met piper-tts (onnx), geen netwerk nodig
zodra het stemmodel eenmaal gedownload is.

Levert WAV-bytes en een boundaries-lijst volgens hetzelfde
(audio, boundaries)-contract als edge_engine.synthesize. Piper geeft geen
woordtijdstempels; de boundaries worden daarom GESCHAT uit de tekst en de
gemeten WAV-duur (proportioneel naar woordlengte, met extra gewicht voor een
leesteken-pauze). De schatting is goed genoeg voor woord-highlighting, maar
geen exacte alignering.

VOICE_DIR is een module-constante maar wordt op aanroepmoment gelezen
(ledger Ruling 2): functies verwijzen naar de globale naam, dus tests kunnen
`monkeypatch.setattr(piper_engine, "VOICE_DIR", tmp_path)` gebruiken.
"""

import io
import re
import urllib.request
import wave
from pathlib import Path

VOICE_DIR = Path.home() / ".local" / "share" / "tts-lnx-helper" / "voices"

DEFAULT_VOICES = {"nl": "nl_NL-mls-medium"}

# Download-basis: https://huggingface.co/rhasspy/piper-voices/resolve/main/
_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"

# Maximale wachttijd per download; voorkomt onbeperkt hangen op een dode verbinding.
DOWNLOAD_TIMEOUT = 60

_voice_cache = {}

# Letters/cijfers tellen mee voor de spreekduur van een woord.
_LETTER_RE = re.compile(r"[^\W_]", re.UNICODE)

# Leesteken aan het einde van een woord geeft een gesproken pauze; die krijgt
# extra gewicht zodat het volgende woord geschat later start.
_PUNCT_WEIGHT = {",": 2, ";": 2, ":": 2, ".": 4, "!": 4, "?": 4, "…": 4}


def estimate_word_boundaries(text, duration_ms):
    """Schat woord-timing: elk woord krijgt een aandeel van `duration_ms`
    naar rato van zijn aantal letters, plus extra gewicht voor een
    eind-leesteken (pauze). Geeft dezelfde vorm als edge levert:
    [{text, offsetMs, durationMs}]."""
    woorden = str(text).split()
    if not woorden or duration_ms <= 0:
        return []
    gewichten = []
    for woord in woorden:
        gewicht = max(1, len(_LETTER_RE.findall(woord)))
        gewicht += _PUNCT_WEIGHT.get(woord[-1], 0)
        gewichten.append(gewicht)
    totaal = sum(gewichten)
    boundaries = []
    offset = 0.0
    for woord, gewicht in zip(woorden, gewichten):
        duur = duration_ms * gewicht / totaal
        boundaries.append({
            "text": woord,
            "offsetMs": round(offset),
            "durationMs": round(duur),
        })
        offset += duur
    return boundaries


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
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT) as antwoord:
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

    Geeft (wav-bytes, boundaries) — piper levert geen word-boundaries, dus die
    worden geschat uit de tekst en de gemeten audioduur (zie
    estimate_word_boundaries). Alle chunks worden in geheugen tot één WAV
    samengevoegd; er wordt geen paginatekst of audio naar schijf geschreven
    (alleen het stemmodel zelf staat op schijf).
    """
    from piper.config import SynthesisConfig  # lazy: piper is een optionele extra
    stem = load_voice(ensure_voice(voice))
    config = SynthesisConfig(length_scale=length_scale(rate))

    buffer = io.BytesIO()
    eerste_chunk = True
    totaal_frames = 0
    framerate = 22050  # fallback als er geen chunks zijn
    with wave.open(buffer, "wb") as wav:
        for chunk in stem.synthesize(text, syn_config=config):
            if eerste_chunk:
                # WAV-header volgt de eigenschappen van de eerste chunk.
                wav.setnchannels(chunk.sample_channels)
                wav.setsampwidth(chunk.sample_width)
                wav.setframerate(chunk.sample_rate)
                framerate = chunk.sample_rate
                eerste_chunk = False
            wav.writeframes(chunk.audio_int16_bytes)
            totaal_frames += len(chunk.audio_int16_bytes) // (
                chunk.sample_width * chunk.sample_channels)
        if eerste_chunk:
            # Geen chunks (bijv. lege tekst): schrijf een standaardheader zodat
            # wave.close() geen wave.Error gooit en er een valide lege WAV uitkomt.
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(framerate)
    duur_ms = totaal_frames / framerate * 1000
    return buffer.getvalue(), estimate_word_boundaries(text, duur_ms)
