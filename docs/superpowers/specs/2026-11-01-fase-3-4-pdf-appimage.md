# Fase 3 (PDF) + fase 4 (AppImage, Piper-woordtiming) — ontwerp

> Voortborduurt op `2026-10-22-firefox-tts-extensie-design.md` §10 (fasering).
> Beslissingen bevestigd door de gebruiker op 2026-11-01: PDF's automatisch
> afvangen; Piper-woordtiming geschat proportioneel; AppImage naast pipx.

## Fase 3 — PDF-ondersteuning

**Probleem:** de ingebouwde Firefox-PDF-viewer (pdf.js als privileged page)
blokkeert content scripts; de extensie kan daar dus niet voorlezen.

**Aanpak:**
- `webRequest.onHeadersReceived` (blocking) op `main_frame`-responses met
  `Content-Type: application/pdf` → `redirectUrl` naar eigen viewer-tab:
  `viewer/viewer.html?src=<originele-url>`.
  - Nieuwe permissies: `webRequest`, `webRequestBlocking` en host-permissie
    `<all_urls>` (nodig voor het blokkeren/omleiden). Dit verandert de
    permissie-waarschuwing bij installatie; AMO-review hierop voorbereiden.
  - `file://`-PDF's buiten scope (viewer werkt alleen http/https).
- Eigen viewer (`extension/viewer/viewer.html` + `viewer.js`), gebundeld met
  pdf.js (`pdfjs-dist`, Apache-2.0 — zelfde vendor-aanpak als Readability):
  - PDF ophalen via `pdfjsLib.getDocument(src)` (extension page met
    host-permissies mag cross-origin fetchen).
  - Per pagina: canvas-render + pdf.js **tekstlaag** (TextLayer-API).
- **Voorlezen:** de viewer-pagina hergebruikt de bestaande logica
  (gedeelde modules onder `extension/shared/`): zinsplitsing op de
  tekstlaag-DOM, zin- en woordmarkering, playerbar, berichten met de
  background voor TTS. Klik-op-tekst = vanaf daar lezen; selectie-voorlezen
  via het bestaande contextmenu werkt ook in de viewer.
- **Scope-grens:** gescande PDF zonder tekstlaag → melding "geen tekst
  gevonden" (geen OCR).

**AMO:** nieuwe permissies motiveren in de listing; `data_collection_permissions`
blijft `websiteContent` (tekst gaat bij cloud-engine naar Microsoft — nu ook
PDF-tekst; privacyverklaring aanvullen met "PDF's").

## Fase 4a — Piper-woordtiming (geschat, proportioneel)

- Helper (`piper_engine.py`): na synthese de WAV-duur meten en de zin in
  woorden splitsen; elk woord krijgt een aandeel van de duur naar rato van
  aantal letters (kleine extra pauze na leesteken aan woordeinde).
- API: het synthesize-antwoord krijgt `word_timings` ook voor engine
  `piper` (zelfde vorm als edge levert: woord + offset + duur), zodat de
  extensie één codepad houdt voor woordmarkering.
- Tests: aantal timings == aantal woorden; offsets monotoon stijgend;
  laatste eindtijd == audioduur; leesteken-pauze > 0.

## Fase 4b — AppImage-verspreiding van de helper

- `scripts/build-appimage.sh`: PyInstaller (one-dir) → AppDir →
  `appimagetool` → `tts-lnx-helper-x86_64.AppImage`, met piper-engine en de
  Nederlandse stem ingebakken (offline out-of-the-box).
- README: AppImage als tweede installatiepad naast pipx
  ("download → `chmod +x` → start"); autostart blijft via bestaand commando.
- Distributie via GitHub Release-artifact; AMO-listing verwijst ernaartoe
  zodra de repo publiek is.

## Volgorde en testaanpak

1. Fase 3 (viewer + afvangen) — vitest voor splitter/locatie-hergebruik,
   handmatige RDP-check in Xvfb-Firefox met een echte PDF.
2. Fase 4a — helper-tests (`cd helper && python -m pytest`).
3. Fase 4b — build lokaal draaien, AppImage starten en `/health` checken.

Elke fase eindigt met tests groen + commit + push. Daarna versie 0.3.0
(unlisted sign + listed-indiening bij AMO).
