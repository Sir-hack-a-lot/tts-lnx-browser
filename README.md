# TTS LNX Browser

Firefox-extensie die webpagina's voorleest met natuurlijke neurale stemmen —
de "Read Aloud"-feature die Edge/Chrome op Windows en macOS hebben, maar dan
voor Linux.

## Status

MVP (fase 1): cloud-stemmen via Edge TTS. Lokaal voorlezen via Piper
(fase 2) en PDF-ondersteuning (fase 3) volgen; zie
`docs/superpowers/specs/2026-10-22-firefox-tts-extensie-design.md`.

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

## Gebruik

- Klik op het luidspreker-icoon in de werkbalk, of druk op **Alt+R**.
- De playerbar onderin: vorige/volgende zin, pauze, stop, snelheid (0,5×–2×).
- De actieve zin en het actieve woord lichten op; de pagina scrollt mee.
- Klik op een alinea om vanaf die plek voor te lezen.
- Instellingen (about:addons → TTS LNX Browser → Voorkeuren): standaard-
  snelheid en stem per taal (Nederlands, Engels, Duits, Frans, Spaans).

## Privacy

Bij cloud-voorlezen gaat de paginatekst naar Microsoft (Edge TTS). De
extensie doet verder geen netwerkverkeer en verzamelt geen gegevens.
Volledig lokale verwerking komt in fase 2 met de optionele Piper-helper.

## Bekende beperkingen (MVP)

- De Edge TTS API is onofficieel; bij wijzigingen kan cloud-voorlezen
  tijdelijk stuk zijn (Piper-helper in fase 2 maakt dit onafhankelijk).
- Woord-niveau highlighting werkt alleen met de cloud-engine (Piper levert
  geen woordtiming; zin-niveau blijft dan).
- Snelheid wijzigen geldt vanaf de volgende zin.
- Klik-om-te-seeken springt naar de eerste zin van de aangeklikte alinea.
- Geen PDF-ondersteuning (fase 3).

## Licentie

MPL-2.0, zie LICENSE.
