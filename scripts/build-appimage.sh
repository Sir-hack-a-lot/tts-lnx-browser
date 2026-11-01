#!/usr/bin/env bash
# Bouwt helper/dist/tts-lnx-helper-x86_64.AppImage: een zelfstandige
# PyInstaller-bundle van de helper, inclusief piper-engine en de Nederlandse
# stem (offline out-of-the-box), verpakt als AppImage.
#
# Voorwaarden: python3-venv, curl en ImageMagick (convert). appimagetool wordt
# bij de eerste run gedownload naar helper/dist/appimage-build/.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD="$(pwd)/helper/dist/appimage-build"
APPIMAGETOOL="$BUILD/appimagetool-x86_64.AppImage"
OUT="$(pwd)/helper/dist/tts-lnx-helper-x86_64.AppImage"
VOICE_ID=nl_NL-mls-medium

rm -rf "$BUILD"
mkdir -p "$BUILD/voices"

echo "== build-venv =="
python3 -m venv "$BUILD/venv"
"$BUILD/venv/bin/pip" install -q --upgrade pip
"$BUILD/venv/bin/pip" install -q './helper[piper]' pyinstaller

echo "== Nederlandse stem verzamelen (download alleen als hij ontbreekt) =="
"$BUILD/venv/bin/python" - <<'PY'
from pathlib import Path
from tts_lnx_helper import piper_engine
piper_engine.VOICE_DIR = Path("helper/dist/appimage-build/voices").resolve()
print("stem:", piper_engine.ensure_voice("nl_NL-mls-medium"))
PY

echo "== PyInstaller-bundle =="
cat > "$BUILD/entry.py" <<'PY'
from tts_lnx_helper.__main__ import main

main()
PY
"$BUILD/venv/bin/pyinstaller" --noconfirm --clean --onedir --console \
  --name tts-lnx-helper \
  --distpath "$BUILD/pyinstaller" \
  --workpath "$BUILD/pyinstaller-work" \
  --specpath "$BUILD" \
  --collect-all piper --collect-all onnxruntime \
  --add-data "$BUILD/voices/$VOICE_ID.onnx:voices" \
  --add-data "$BUILD/voices/$VOICE_ID.onnx.json:voices" \
  "$BUILD/entry.py"

echo "== AppDir =="
APPDIR="$BUILD/AppDir"
mkdir -p "$APPDIR/usr/bin"
mv "$BUILD/pyinstaller/tts-lnx-helper" "$APPDIR/usr/bin/tts-lnx-helper"
cat > "$APPDIR/AppRun" <<'SH'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/tts-lnx-helper/tts-lnx-helper" "$@"
SH
chmod +x "$APPDIR/AppRun"
cat > "$APPDIR/tts-lnx-helper.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=TTS LNX Helper
Comment=Lokale TTS-helper voor de TTS LNX Browser-extensie
Exec=tts-lnx-helper
Icon=tts-lnx-helper
Terminal=false
Categories=Utility;
DESKTOP
convert -background none extension/icons/icon.svg -resize 256x256 "$APPDIR/tts-lnx-helper.png"

echo "== appimagetool =="
if [ ! -f "$APPIMAGETOOL" ]; then
  curl -fL -o "$APPIMAGETOOL" \
    https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x "$APPIMAGETOOL"
fi
mkdir -p "$(dirname "$OUT")"
if ! "$APPIMAGETOOL" "$APPDIR" "$OUT"; then
  # Op machines zonder FUSE: appimagetool pakt zichzelf dan eerst uit.
  echo "direct draaien mislukt; probeer met APPIMAGE_EXTRACT_AND_RUN=1"
  APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL" "$APPDIR" "$OUT"
fi

echo "Klaar: $OUT"
