"""Contracttest: de echte /synthesize-response van de helper moet exact
overeenkomen met de gedeelde fixture die ook de extensietest gebruikt."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

import tts_lnx_helper.server as server

# Gedeeld contract met de extensie; pad relatief aan de repo-root.
FIXTURE = (Path(__file__).resolve().parents[2]
           / "tests" / "fixtures" / "synthesize-response.json")


def test_synthesize_response_komt_overeen_met_contractfixture(monkeypatch):
    contract = json.loads(FIXTURE.read_text(encoding="utf-8"))

    async def fake_synth(text, voice, rate):
        # "TVAz" uit de fixture is base64 voor b"MP3".
        return b"MP3", [{"text": "Hallo", "offsetMs": 0, "durationMs": 300}]

    monkeypatch.setattr(server.edge_engine, "synthesize", fake_synth)
    client = TestClient(server.create_app())
    r = client.post("/synthesize", json={
        "text": "Hallo.", "voice": "nl-NL-MaartenNeural",
        "rate": 1.0, "engine": "edge"})
    assert r.status_code == 200
    # Volledige response-JSON moet gelijk zijn aan de fixture (zelfde vorm,
    # zelfde sleutels, zelfde waarden aan beide kanten van het contract).
    assert r.json() == contract
