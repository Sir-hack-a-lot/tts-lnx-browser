# tts-lnx-helper

Lokale TTS-helper voor de TTS LNX Browser Firefox-extensie.

## Installatie

    pipx install tts-lnx-helper
    tts-lnx-helper          # draaien op 127.0.0.1:5020

Optioneel automatisch starten bij inloggen:

    tts-lnx-helper-autostart install   # of: python -m tts_lnx_helper.autostart install

## Engines

- `edge` (standaard): proxy naar Edge TTS — mooiste stemmen, internet nodig,
  paginatekst gaat naar Microsoft.
- `piper`: volledig lokaal en offline. De Nederlandse stem
  (nl_NL-mls-medium) wordt bij eerste gebruik gedownload naar
  ~/.local/share/tts-lnx-helper/voices/.

## Privacy

De helper luistert alleen op 127.0.0.1 en schrijft geen paginatekst naar
schijf. Logregels bevatten geen inhoud.
