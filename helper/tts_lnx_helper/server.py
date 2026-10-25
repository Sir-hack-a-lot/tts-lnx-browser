"""FastAPI-server van de helper. Bindt uitsluitend op 127.0.0.1 (zie __main__)."""
import base64
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from . import edge_engine


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

    return app
