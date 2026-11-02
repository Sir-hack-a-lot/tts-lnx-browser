# tts-lnx-helper

_[Nederlandse versie](README.nl.md)_

Local TTS helper for the TTS LNX Browser Firefox extension.

## Installation

**Option 1 — AppImage (no Python needed):**

    # Download tts-lnx-helper-x86_64.AppImage from GitHub Releases
    chmod +x tts-lnx-helper-x86_64.AppImage
    ./tts-lnx-helper-x86_64.AppImage          # runs on 127.0.0.1:5020

The AppImage contains the piper engine *and* the Dutch voice, so the local
engine works offline out of the box. Build from source:

    ./scripts/build-appimage.sh   # requires python3-venv, curl and ImageMagick

**Option 2 — pipx:**

    pipx install 'tts-lnx-helper[piper]'
    tts-lnx-helper          # runs on 127.0.0.1:5020

Or from a source checkout:

    git clone https://github.com/Sir-hack-a-lot/tts-lnx-browser.git
    cd tts-lnx-browser
    pipx install './helper[piper]'
    tts-lnx-helper

The `[piper]` extra installs the local piper engine. Without it
(`pipx install tts-lnx-helper`) only the cloud engine (edge) works; a
"local" preference then fails with "piper not available".

Optionally start automatically at login (pipx install):

    tts-lnx-helper-autostart install   # or: python -m tts_lnx_helper.autostart install

For the AppImage, create autostart yourself with a .desktop entry in
~/.config/autostart pointing at the AppImage path.

## Engines

- `edge` (default): proxy to Edge TTS — best-quality voices, internet
  required, page text goes to Microsoft. Word timing comes from Edge itself.
- `piper`: fully local and offline. The Dutch voice (nl_NL-mls-medium) is
  downloaded on first use to ~/.local/share/tts-lnx-helper/voices/ (in the
  AppImage it is already bundled). Piper provides no word timestamps; the
  helper estimates word timing proportionally from the text and the audio
  duration.

## Privacy

The helper listens only on 127.0.0.1 and writes no page text to disk. Log
lines contain no content.
