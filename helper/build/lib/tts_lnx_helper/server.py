"""FastAPI-server van de helper. Bindt uitsluitend op 127.0.0.1 (zie __main__)."""
import base64
import logging
import urllib.error
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from . import edge_engine
from . import piper_engine

logger = logging.getLogger(__name__)

# Statische Edge-stemmenlijst: (id, naam, taal). Edge kent honderden stemmen;
# dit is de vaste selectie die de extensie aanbiedt.
EDGE_VOICES = [
    ("nl-NL-MaartenNeural", "Maarten (Nederlands)", "nl-NL"),
    ("nl-NL-FennaNeural", "Fenna (Nederlands)", "nl-NL"),
    ("nl-NL-ColetteNeural", "Colette (Nederlands)", "nl-NL"),
    ("en-US-JennyNeural", "Jenny (Engels, VS)", "en-US"),
    ("en-GB-SoniaNeural", "Sonia (Engels, VK)", "en-GB"),
    ("de-DE-ConradNeural", "Conrad (Duits)", "de-DE"),
    ("de-DE-KatjaNeural", "Katja (Duits)", "de-DE"),
    ("fr-FR-DeniseNeural", "Denise (Frans)", "fr-FR"),
    ("fr-FR-HenriNeural", "Henri (Frans)", "fr-FR"),
    ("es-ES-ElviraNeural", "Elvira (Spaans)", "es-ES"),
    ("es-ES-AlvaroNeural", "Alvaro (Spaans)", "es-ES"),
]


class SynthesizeRequest(BaseModel):
    """Inkomend syntheseverzoek van de browserextensie."""
    text: str
    voice: str
    rate: float = 1.0
    engine: str = "edge"


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

    @app.get("/voices")
    def voices():
        """Alle beschikbare stemmen: de vaste Edge-selectie plus de Piper-stemmen
        die al in VOICE_DIR geïnstalleerd zijn (alleen paren van .onnx +
        .onnx.json tellen mee). VOICE_DIR wordt op aanroepmoment gelezen."""
        lijst = [{"id": vid, "name": naam, "lang": taal, "engine": "edge"}
                 for vid, naam, taal in EDGE_VOICES]
        stem_dir = piper_engine.VOICE_DIR
        if stem_dir.is_dir():
            for onnx in sorted(stem_dir.glob("*.onnx")):
                if not onnx.with_suffix(".onnx.json").exists():
                    continue
                vid = onnx.name[: -len(".onnx")]
                taal = vid.split("-", 1)[0].replace("_", "-")
                lijst.append({"id": vid, "name": vid, "lang": taal, "engine": "piper"})
        return lijst

    @app.post("/synthesize")
    async def synthesize(req: SynthesizeRequest):
        if req.engine == "edge":
            try:
                audio, boundaries = await edge_engine.synthesize(req.text, req.voice, req.rate)
            except RuntimeError as e:
                raise HTTPException(502, str(e))
            return {"audio_b64": base64.b64encode(audio).decode(),
                    "format": "mp3", "boundaries": boundaries}
        if req.engine == "piper":
            if not piper_beschikbaar():
                raise HTTPException(503, "engine 'piper' niet beschikbaar")
            try:
                # piper_engine.synthesize is synchroon; ontbreekt de stem dan
                # downloadt ensure_voice die eerst (zie piper_engine).
                audio, boundaries = piper_engine.synthesize(req.text, req.voice, req.rate)
            except (urllib.error.URLError, TimeoutError) as e:
                # Download van de stem mislukt (netwerkfout of timeout):
                # tijdelijk niet beschikbaar.
                raise HTTPException(503, f"stemdownload mislukt: {e}")
            except Exception as e:
                # Ruwe engine-exceptie niet doorgeven: die kan engine-internals
                # (en invoerfragmenten uit de phonemizer) bevatten en belandt
                # recht in de playerbar. Vaste schone melding naar de client;
                # server-side alleen het exceptietype loggen, nooit de inhoud.
                logger.warning("Piper-synthese mislukt (%s)", type(e).__name__)
                raise HTTPException(502, "Piper-synthese mislukt")
            return {"audio_b64": base64.b64encode(audio).decode(),
                    "format": "wav", "boundaries": boundaries}
        raise HTTPException(503, f"engine '{req.engine}' niet beschikbaar")

    return app
