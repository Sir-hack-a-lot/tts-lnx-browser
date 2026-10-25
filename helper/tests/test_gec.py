import re
from tts_lnx_helper.gec import compute_sec_ms_gec

VECTOR_TS = 1792875899368  # 2026-10-24T21:04:59.368Z
VECTOR = "7F74E35C69DF60B0-9069C6F7F6FE2ACADAACEA11451034FB2C42E3AB6E69A02D2EB03748AAC8E100"


def test_v2_formaat():
    token = compute_sec_ms_gec(VECTOR_TS)
    assert re.fullmatch(r"[0-9A-F]{16}-[0-9A-F]{64}", token)


def test_venster_determinisme():
    a = compute_sec_ms_gec(VECTOR_TS)
    # VECTOR_TS ligt op seconde 299 van zijn 300s-venster; +60s valt dus in het
    # volgende venster. Binnen het venster is alleen een negatieve offset geldig.
    assert compute_sec_ms_gec(VECTOR_TS - 60_000) == a       # zelfde 5-min-venster
    assert compute_sec_ms_gec(VECTOR_TS + 1_000) != a        # volgend venster


def test_regressievector():
    # Bevroren token, live tegen de echte dienst geverifieerd (handshake 101).
    assert compute_sec_ms_gec(VECTOR_TS) == VECTOR
