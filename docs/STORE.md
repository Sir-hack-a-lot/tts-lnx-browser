# AMO store-metadata — TTS LNX Browser

_Velden voor de publieke vermelding op addons.mozilla.org. Aanvullen in het
ontwikkelaarsportaal (Developer Hub) bij het indienen van de listed versie._

## Naam / Name

TTS LNX Browser

## Samenvatting (max 250 tekens)

- **NL:** Leest webpagina's voor met natuurlijke stemmen — de Read Aloud die
  Firefox op Linux mist. Cloud-stemmen (Edge TTS) of volledig offline met
  Piper, via een kleine lokale helper.
- **EN:** Reads web pages aloud with natural-sounding voices — the Read Aloud
  feature Firefox on Linux is missing. Cloud voices (Edge TTS) or fully
  offline with Piper, via a small local helper.

## Beschrijving / Description

- **NL:**

> TTS LNX Browser leest artikelen en webpagina's voor, zin voor zin, met de
> te lezen zin en het actieve woord gemarkeerd op de pagina.
>
> - Bediening via werkbalkknop of Alt+R: vorige/volgende zin, pauze, tempo.
> - Klik op een alinea om vanaf daar te beginnen.
> - Twee engines: cloud (Edge TTS via Microsoft, mooiste stemmen) of lokaal
>   (Piper, volledig offline).
> - Meertalig: Nederlands en Engels.
>
> De extensie vereist een kleine lokale helper
> (`pipx install './helper[piper]'`, zie README) die op je eigen computer
> draait. Bij de cloud-engine gaat de voorgelezen tekst naar Microsoft; bij
> de lokale engine blijft alles op je computer. Zie de privacyverklaring.

- **EN:**

> TTS LNX Browser reads articles and web pages aloud, sentence by sentence,
> with the current sentence and word highlighted on the page.
>
> - Controls via toolbar button or Alt+R: previous/next sentence, pause, speed.
> - Click a paragraph to start reading from there.
> - Two engines: cloud (Edge TTS via Microsoft, best-quality voices) or local
>   (Piper, fully offline).
> - Bilingual: English and Dutch.
>
> The extension requires a small local helper
> (`pipx install './helper[piper]'`, see README) that runs on your own
> computer. With the cloud engine, the text being read is sent to Microsoft;
> with the local engine, everything stays on your computer. See the privacy
> policy.

## Categorieën

- Accessibility (primair)
- Other (secundair)

## Tags

read aloud, text to speech, tts, accessibility, linux, piper, edge-tts

## Privacyverklaring

De tekst uit `docs/PRIVACY.md` (NL+EN) in het veld "Privacy Policy" plakken.

## Broncode voor de review

De extensie is gebundeld met esbuild; bij indiening een zip van de bron
(`extension/`, `scripts/build.js`, `package.json`) uploaden als
"Source code" met build-instructie `npm ci && npm run build`.

## Screenshots (nog maken)

1. Playerbar op een nieuwsartikel met actieve zin- en woordmarkering.
2. Optiepagina (engine-keuze + privacyvermelding).

## Homepage / support

GitHub-repo (momenteel private — publiek maken óf velden leeg laten).
