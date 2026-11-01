# TTS LNX Browser

Firefox-extensie die webpagina's voorleest met natuurlijke neurale stemmen —
de "Read Aloud"-feature die Edge/Chrome op Windows en macOS hebben, maar dan
voor Linux.

## Status

Fase 3: de extensie praat via HTTP met een lokale helper
(`tts-lnx-helper`, op 127.0.0.1:5020) met twee engines, en leest ook PDF's
voor via een eigen pdf.js-viewer:

- **edge** — proxy naar Edge TTS (Microsoft, cloud): mooiste stemmen en
  echte woordtiming.
- **piper** — volledig lokaal en offline: woordtiming wordt geschat
  (proportioneel), dus highlight op woordniveau is daar minder strak.

Zie `docs/superpowers/specs/` voor de ontwerpdocumenten.

## Installatie

De extensie heeft de helper nodig; zonder helper werkt voorlezen niet.

1. Installeer en start de helper — kies één van beide (zie ook
   `helper/README.md`):

   **AppImage** (geen Python nodig; bevat de piper-engine én de Nederlandse
   stem, dus werkt ook offline):

       # Download tts-lnx-helper-x86_64.AppImage uit de GitHub Releases
       chmod +x tts-lnx-helper-x86_64.AppImage
       ./tts-lnx-helper-x86_64.AppImage

   **pipx** (vanuit bron):

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
- Selecteer tekst en kies in het rechtermuismenu **"Lees selectie voor"** om
  alleen die selectie te horen.
- **PDF's** openen automatisch in de eigen viewer (pdf.js) zodat ze
  voorgelezen kunnen worden; dezelfde bediening, markering en
  selectie-voorlezing gelden daar ook. PDF-downloads (bijlagen) blijven
  gewoon downloaden.
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
- Woord-highlighting met de piper-engine is een schatting en kan iets
  voor- of achterlopen op de audio.
- Snelheid wijzigen geldt vanaf de volgende zin.
- Klik-om-te-seeken springt naar de eerste zin van de aangeklikte alinea.
- PDF's zonder tekstlaag (gescande documenten) kunnen niet worden
  voorgelezen; OCR zit niet in de extensie. `file://`-PDF's worden niet
  afgevangen.
- De PDF-viewer bundelt pdf.js (Apache-2.0).

## Licentie

MPL-2.0, zie LICENSE.
