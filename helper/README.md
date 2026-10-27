# tts-lnx-helper

Lokale TTS-helper voor de TTS LNX Browser Firefox-extensie.

## Installatie

    git clone https://github.com/Sir-hack-a-lot/tts-lnx-browser.git
    cd tts-lnx-browser
    pipx install './helper[piper]'
    tts-lnx-helper          # draaien op 127.0.0.1:5020

De extra `[piper]` installeert de lokale piper-engine mee. Zonder die extra
(`pipx install ./helper`) werkt alleen de cloud-engine (edge); een voorkeur
voor "lokaal" mislukt dan met "piper niet beschikbaar".

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
