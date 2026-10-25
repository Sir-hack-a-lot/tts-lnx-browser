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
