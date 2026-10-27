# TTS LNX Browser

Firefox-extensie die webpagina's voorleest met natuurlijke neurale stemmen —
de "Read Aloud"-feature die Edge/Chrome op Windows en macOS hebben, maar dan
voor Linux.

## Status

Fase 2: de extensie praat via HTTP met een lokale helper
(`tts-lnx-helper`, op 127.0.0.1:5020) met twee engines:

- **edge** — proxy naar Edge TTS (Microsoft, cloud): mooiste stemmen en
  highlighting op woordniveau.
- **piper** — volledig lokaal en offline: highlighting op zinsniveau.

PDF-ondersteuning (fase 3) volgt; zie
`docs/superpowers/specs/2026-10-22-firefox-tts-extensie-design.md`.

## Installatie

De extensie heeft de helper nodig; zonder helper werkt voorlezen niet.

1. Clone de repo en installeer en start de helper (zie ook `helper/README.md`):

       git clone https://github.com/Sir-hack-a-lot/tts-lnx-browser.git
       cd tts-lnx-browser
       pipx install './helper[piper]'
       tts-lnx-helper          # draait op 127.0.0.1:5020

   De extra `[piper]` installeert de lokale piper-engine mee; zonder die
   extra werkt alleen de cloud-engine (edge).

   Het pakket staat (nog) niet op PyPI; publicatie kan later volgen.

2. Optioneel automatisch starten bij inloggen:

       tts-lnx-helper-autostart install

3. Installeer de extensie in Firefox: bouw met `npm run package` en laad
   `web-ext-artifacts/tts_lnx_browser-<versie>.zip`, of draai tijdelijk met
   `npm start`.

Bij eerste gebruik van de piper-engine wordt de Nederlandse stem
(nl_NL-mls-medium) gedownload naar `~/.local/share/tts-lnx-helper/voices/`.

## Ontwikkelen

    npm install
    npm test          # unit- en integratietests (Vitest)
    npm run build     # bundelt naar dist/
    npm run lint      # web-ext lint
    npm start         # start Firefox met de extensie geladen
    npm run package   # bouwt web-ext-artifacts/tts_lnx_browser-<versie>.zip

`npm start` gebruikt `scripts/run-dev.sh`: die zet TMPDIR onder `$HOME` zodat
ook snap-Firefox het tijdelijke web-ext-profiel kan lezen (anders:
"Your Firefox profile cannot be loaded").

Helper ontwikkelen: zie `helper/README.md` (tests:
`cd helper && .venv/bin/python -m pytest tests/ -q`).

## Gebruik

- Klik op het luidspreker-icoon in de werkbalk, of druk op **Alt+R**.
- De playerbar onderin: vorige/volgende zin, pauze, stop, snelheid (0,5×–2×).
- De actieve zin licht op en de pagina scrollt mee; met de edge-engine licht
  ook het actieve woord op.
- Klik op een alinea om vanaf die plek voor te lezen.
- Instellingen (about:addons → TTS LNX Browser → Voorkeuren): standaard-
  snelheid, stem per taal (Nederlands, Engels, Duits, Frans, Spaans) en
  engine-keuze:
  - **Cloud (Edge TTS — mooiste stemmen)**
  - **Lokaal (Piper — offline, eigen stemmen)**
  - **Lokaal eerst, cloud als reserve**
- Draait de helper niet, dan toont de playerbar een installatie-melding;
  de extensie crasht niet en werkt weer zodra de helper start.

## Privacy

- Engine **edge**: de paginatekst gaat via de lokale helper naar Microsoft
  (Edge TTS).
- Engine **piper**: volledig lokale verwerking, geen netwerkverkeer met
  paginatekst.
- De helper luistert alleen op 127.0.0.1, schrijft geen paginatekst naar
  schijf en logt geen inhoud. De extensie verzamelt geen gegevens.

## Bekende beperkingen

- De Edge TTS API is onofficieel; bij wijzigingen kan cloud-voorlezen
  tijdelijk stuk zijn (de piper-engine maakt hier onafhankelijk van).
- Woord-niveau highlighting werkt alleen met de edge-engine (Piper levert
  geen woordtiming; highlighting blijft dan op zinsniveau).
- Snelheid wijzigen geldt vanaf de volgende zin.
- Klik-om-te-seeken springt naar de eerste zin van de aangeklikte alinea.
- Geen PDF-ondersteuning (fase 3).

## Licentie

MPL-2.0, zie LICENSE.
