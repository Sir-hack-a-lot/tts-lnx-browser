"""Autostart-installer: schrijft/verwijdert een XDG .desktop-entry zodat de
helper automatisch start bij inloggen op de desktop.

AUTOSTART_DIR is een module-constante maar wordt op aanroepmoment gelezen
(zelfde patroon als VOICE_DIR in piper_engine): functies verwijzen naar de
globale naam, dus tests kunnen
`monkeypatch.setattr(autostart, "AUTOSTART_DIR", tmp_path)` gebruiken.
"""

import sys
from pathlib import Path

AUTOSTART_DIR = Path.home() / ".config" / "autostart"

DESKTOP_BESTAND = "tts-lnx-helper.desktop"

_DESKTOP_INHOUD = """[Desktop Entry]
Type=Application
Name=TTS LNX Helper
Comment=Lokale TTS-helper voor de TTS LNX Browser-extensie
Exec=tts-lnx-helper
Terminal=false
X-GNOME-Autostart-enabled=true
"""


def install() -> None:
    """Schrijf de .desktop-entry in AUTOSTART_DIR (overschrijft een bestaande)."""
    AUTOSTART_DIR.mkdir(parents=True, exist_ok=True)
    pad = AUTOSTART_DIR / DESKTOP_BESTAND
    pad.write_text(_DESKTOP_INHOUD)
    print(f"Autostart geïnstalleerd: {pad}")


def uninstall() -> None:
    """Verwijder de .desktop-entry; geen fout als die er niet is."""
    pad = AUTOSTART_DIR / DESKTOP_BESTAND
    try:
        pad.unlink()
        print(f"Autostart verwijderd: {pad}")
    except FileNotFoundError:
        print(f"Geen autostart-entry gevonden: {pad}")


def main(argv=None) -> None:
    """CLI-entry: `install` of `uninstall`."""
    args = sys.argv[1:] if argv is None else argv
    if args == ["install"]:
        install()
    elif args == ["uninstall"]:
        uninstall()
    else:
        print("Gebruik: tts-lnx-helper-autostart install|uninstall", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
