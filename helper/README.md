# tts-lnx-helper

Lokale TTS-helper voor de TTS LNX Browser Firefox-extensie.

## Installatie

**Optie 1 — AppImage (geen Python nodig):**

    # Download tts-lnx-helper-x86_64.AppImage uit de GitHub Releases
    chmod +x tts-lnx-helper-x86_64.AppImage
    ./tts-lnx-helper-x86_64.AppImage          # draait op 127.0.0.1:5020

De AppImage bevat de piper-engine én de Nederlandse stem, dus de lokale
engine werkt ook zonder internet. Bouwen vanuit bron:

    ./scripts/build-appimage.sh   # vereist python3-venv, curl en ImageMagick

**Optie 2 — pipx:**

    git clone https://github.com/Sir-hack-a-lot/tts-lnx-browser.git
    cd tts-lnx-browser
    pipx install './helper[piper]'
    tts-lnx-helper          # draaien op 127.0.0.1:5020

De extra `[piper]` installeert de lokale piper-engine mee. Zonder die extra
(`pipx install ./helper`) werkt alleen de cloud-engine (edge); een voorkeur
voor "lokaal" mislukt dan met "piper niet beschikbaar".

Optioneel automatisch starten bij inloggen (pipx-installatie):

    tts-lnx-helper-autostart install   # of: python -m tts_lnx_helper.autostart install

Bij de AppImage maak je autostart zelf aan met een .desktop-entry in
~/.config/autostart die naar het AppImage-pad verwijst.

## Engines

- `edge` (standaard): proxy naar Edge TTS — mooiste stemmen, internet nodig,
  paginatekst gaat naar Microsoft. Woord-timing komt van Edge zelf.
- `piper`: volledig lokaal en offline. De Nederlandse stem
  (nl_NL-mls-medium) wordt bij eerste gebruik gedownload naar
  ~/.local/share/tts-lnx-helper/voices/ (in de AppImage is hij al meegepakt).
  Piper levert geen woord-timestamps; de helper schat de woordtiming
  proportioneel uit de tekst en de audioduur.

## Privacy

De helper luistert alleen op 127.0.0.1 en schrijft geen paginatekst naar
schijf. Logregels bevatten geen inhoud.
