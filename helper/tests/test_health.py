from fastapi.testclient import TestClient
from tts_lnx_helper.server import create_app

def test_health_rapporteert_engines():
    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["engines"]["edge"] is True
    assert "piper" in body["engines"]
