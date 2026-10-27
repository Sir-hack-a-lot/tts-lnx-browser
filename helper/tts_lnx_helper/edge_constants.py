"""Gedeelde constanten voor de Edge TTS-websocket (zelfde waarden als de extensie).

De GEC-constanten zijn bevroren als testvector in helper/tests/test_gec.py;
bij wijziging die test mee aanpassen.
"""

TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
# DRM-versie: "2-" + actuele Chromium-build. Bij 403-fouten opnieuw afleiden
# van edge-tts upstream (src/edge_tts/constants.py).
SEC_MS_GEC_VERSION = '2-143.0.3650.75'
# De dienst weigert de websocket-handshake (403) zonder Edge-User-Agent.
EDGE_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ' (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
)
OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
