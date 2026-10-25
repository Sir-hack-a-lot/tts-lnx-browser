# Ontwerp: Firefox-extensie voor natuurlijke voorleesstemmen op Linux

**Datum:** 2026-10-22, herzien 2026-10-25 (helper-gedreven architectuur)
**Status:** herziening goedgekeurd door opdrachtgever (2026-10-25)
**Werkmap:** `/home/randy/TTS_LNX_Browser`

## 1. Probleem en doel

Op Windows en macOS kunnen browsers (Edge, Chrome) webpagina's voorlezen met
natuurlijke neurale stemmen, inclusief woord- en zin-highlighting. Op Linux
ontbreekt deze feature: de beschikbare systeemstemmen (espeak via
speech-dispatcher) klinken robotachtig.

**Doel:** een Firefox-extensie voor Linux die webpagina's en PDF's voorleest met
natuurlijke stemmen, met woord- en zin-highlighting zoals in Edge/Chrome.

**Niet-doelen (YAGNI):**

- Geen eigen browser of fork — alleen een WebExtension.
- Geen mobiele ondersteuning.
- Geen accounts, sync of telemetrie.
- Geen eigen TTS-model trainen; we gebruiken bestaande engines.
- Selectie-voorlezen via rechtsklikmenu is geen MVP-eis (wel een logische
  latere uitbreiding; de architectuur sluit het niet uit).

## 2. Gewaardeerde aanpak (helper-gedreven TTS)

**Herzien 2026-10-25** na de fase-1-smoke-test: Microsoft heeft de Edge TTS
API aangescherpt (Sec-MS-GEC v2-token én verplichte Edge-User-Agent op de
websocket-handshake). Firefox-extensies kunnen de User-Agent van een
websocket niet aanpassen (webRequest ziet geen websockets; bewezen tijdens
debugging). Directe Edge TTS vanuit een Firefox-extensie is daardoor
onmogelijk — de populaire "Read Aloud"-extensie omzeilt dit via een eigen
proxyserver.

Daarom draait **alle synthese via de lokale helper** (`tts-lnx-helper`,
Python-daemon op `127.0.0.1:5020`). De helper heeft twee engines:

- **edge** — proxyt de onofficiële Edge TTS API (Python mag wél een
  Edge-User-Agent sturen). Beste stemkwaliteit, o.a. `nl-NL-MaartenNeural`
  en `nl-NL-FennaNeural`, inclusief woord-timing voor highlighting.
- **piper** — volledig lokale synthese (ONNX). Offline, maximale privacy,
  geen woord-timing (highlighting op zin-niveau).

Gevolg: de extensie vereist een eenmalige helper-installatie
(`pipx install tts-lnx-helper`). Dat is een bewuste breuk met het
oorspronkelijke "werkt direct na installatie" — die belofte is door
Microsoft onmogelijk gemaakt.

Afgewezen alternatieven:

- **Volledig in-browser WASM-TTS** (piper-wasm / Kokoro): piper-wasm is
  experimenteel; Kokoro ondersteunt geen Nederlands of Duits — botst met de
  taleneis. Eventueel later als experiment.
- **Eigen proxyserver:** extra infrastructuur en onderhoud; paginatekst zou
  via een externe server lopen. Voor persoonlijk gebruik is de lokale
  helper eenvoudiger en privacyvriendelijker.
- **Eigen browser/fork:** te veel onderhoud, moeilijk distribueerbaar.

## 3. Talen

Automatische taaldetectie per pagina: eerst het `lang`-attribuut van het
document, anders compacte taaldetectie over de geëxtraheerde tekst. Dekking
minimaal: Nederlands, Engels, Duits, Frans, Spaans (Piper en Edge TTS dekken
beide breed). De gebruiker kan per taal een voorkeursstem instellen.

## 4. Architectuur en componenten

```
┌─ Firefox-extensie ────────────────────────────────┐
│ Toolbar/popup UI + playerbar (play/pauze/snelheid) │
│ Content script: Readability-extractie, zinsplit,   │
│   woord-/zin-highlighting, meescrollen             │
│ Background worker: TTS-orchestratie, audiocache,   │
│   engine-selectie, instellingen                    │
│ PDF-viewer-pagina: pdf.js-tekstextractie           │
└──────────────────────┬─────────────────────────────┘
                       │ HTTP 127.0.0.1:5020
                       ▼
              tts-lnx-helper (FastAPI, alleen localhost)
                       ├─ engine "edge"  ──WSS──▶ Microsoft Edge TTS
                       │      (Edge-User-Agent + Sec-MS-GEC v2;
                       │       Python mag de UA wél zetten)
                       └─ engine "piper" ──▶ lokale ONNX-synthese (WAV)
```

### 4.1 Extractor

- **Webpagina's:** Mozilla Readability.js extraheert de hoofdtekst. Output is
  een genormaliseerde lijst van zinnen; elke zin draagt verwijzingen naar de
  DOM-nodes waar hij vandaan komt (voor highlighting).
- **Fallback:** vindt Readability niets bruikbaars (webapps, exotische
  layouts), dan zichtbare tekst uit `<body>` in DOM-volgorde.
- **PDF's:** de ingebouwde Firefox-PDF-viewer blokkeert content scripts.
  PDF-navigaties worden daarom geopend in een eigen viewer-tab die pdf.js
  gebruikt; extractie draait op de pdf.js-tekstlaag, met dezelfde
  zinnenlijst- en highlight-logica als webpagina's.
- **Zinsplitsing:** eigen splitter (regex+heuristieken per taal), getest met
  unit tests; afkortingen, decimalen en URL's mogen geen valse zinsgrenzen
  geven.

### 4.2 Engine-router

Kiest per verzoek een engine:

1. Gebruikersvoorkeur ("cloud (Edge)" / "lokaal (Piper)" / "lokaal eerst,
   cloud als reserve").
2. Beschikbaarheid volgens `GET /health` van de helper.
3. **Failover:** faalt een engine halverwege een sessie, dan schakelt de
   router over op de andere engine en leest verder vanaf de huidige zin
   (alleen als de gebruikersvoorkeur dat toelaat).

### 4.3 Player

- Speelt audio per zin af; prefetcht de volgende 1–2 zinnen om latency te
  maskeren. Audiocache maximaal ~10 zinnen vooruit, opruiming zodra zinnen
  achter de rug zijn.
- Playerbar onderin het scherm (zoals Edge): play/pauze, vorige/volgende zin,
  snelheid (0,5×–2×), stop, engine-indicator (wolkje = cloud, huisje =
  lokaal).
- Snelheidsregeling: Edge TTS server-side via `rate`-parameter; Piper via
  `--length-scale`.
- Klik op een willekeurige zin in de pagina = "start voorlezen vanaf hier".
- Sneltoets `Alt+R` start/stopt voorlezen.

### 4.4 Highlighting (kernfeature)

- **edge-engine:** de Edge API levert word-boundary-events mee; de helper
  geeft ze door in de synthesize-response (`boundaries[]`). Een timer zet op
  basis hiervan een highlight-klasse op het actieve woord (`tts-word`) en
  een achtergrond op de actieve zin (`tts-sentence`) — het gedrag dat
  Edge/Chrome-gebruikers kennen.
- **piper-engine:** geen woordtiming → highlighting op zin-niveau.
  Stretch goal: geschatte woordtiming uit relatieve woordlengtes.
- De pagina scrollt zacht mee zodra de actieve zin uit beeld dreigt te raken.

### 4.5 Instellingen

- **Engine-voorkeur:** cloud (Edge) / lokaal (Piper) / lokaal eerst met
  cloud-reserve.
- Stemkeuze per taal (groepeerd per engine).
- Standaardsnelheid.
- Helper-statuspaneel: bereikbaarheid, geïnstalleerde stemmen, download van
  extra Piper-stemmen.

### 4.6 tts-lnx-helper

Python-pakket, te installeren met `pipx install tts-lnx-helper`, te starten
met `tts-lnx-helper` (geen root of systemd; optionele autostart via een
`.desktop`-file):

- FastAPI-server, uitsluitend gebonden aan `127.0.0.1:5020`.
- Endpoints:
  - `GET /health` → `{status, engines: {edge: bool, piper: bool}}`
  - `GET /voices` → `[{id, name, lang, engine}]`
  - `POST /synthesize {text, voice, rate}` →
    `{audio_b64, format, boundaries: [{text, offsetMs, durationMs}]}`
    (boundaries leeg bij piper); fout → HTTP 502/503 met melding.
- **edge-engine:** websocket naar de Edge TTS API met Edge-User-Agent en
  Sec-MS-GEC v2 (CS64+SHA-256; algoritme bewezen in de extensie, geporteerd
  met dezelfde bevroren testvector).
- **piper-engine:** `piper-tts` (pip), stemmen (ONNX) in
  `~/.local/share/tts-lnx-helper/voices/`; de Nederlandse standaardstem wordt
  bij eerste gebruik automatisch gedownload. Snelheid via `length_scale`.
- De helper schrijft geen paginatekst naar schijf; logging beperkt tot
  foutmeldingen zonder inhoud.

## 5. Dataflow tijdens voorlezen

1. **Activeren** — werkbalkknop of `Alt+R`. Content script draait Readability
   en bouwt de zinnenlijst met DOM-ankers.
2. **Player start** — playerbar verschijnt; zin 1 gaat naar de helper.
   - *edge:* helper → websocket → MP3-audio + word-boundary-events.
   - *piper:* helper → lokale synthese → WAV (geen woordtiming).
3. **Afspelen + highlight** — audio speelt; word-boundaries (edge) of
   zingrenzen (piper) sturen de highlight; pagina scrollt zacht mee.
4. **Prefetch** — zin *n+1* wordt gesynthetiseerd terwijl *n* speelt.
5. **Bediening** — pauze/hervat, vorige/volgende zin, snelheid, stop,
   klik-op-zin.
6. **PDF** — PDF-links openen in de eigen viewer-tab; daarna identieke flow.

## 6. Foutafhandeling en edge cases

| Situatie | Gedrag |
|---|---|
| Helper draait niet | Playerbar-melding met installatie-instructie (`pipx install tts-lnx-helper`) |
| Geen internet / Edge TTS onbereikbaar | Failover naar piper (als toegestaan); anders melding |
| Piper-stem ontbreekt | Eerste gebruik downloadt de standaardstem; lukt dat niet: melding |
| Onleesbare pagina | Fallback op zichtbare bodytekst; bij leeg resultaat melding "geen voorleesbare tekst gevonden" |
| Pagina wijzigt tijdens voorlezen (SPA) | Zinnenlijst is een snapshot; ankers opnieuw zoeken, lukt dat niet dan doorspelen zonder highlight |
| Taal niet herkend | Terugvallen op browsertaal; gebruiker kan overrulen |
| Engine faalt halverwege | Failover naar andere engine vanaf huidige zin (als voorkeur dat toelaat) |

## 7. Beveiliging en privacy

- Helper bindt alleen op `127.0.0.1`; geen externe poorten.
- Paginatekst gaat uitsluitend naar de lokale helper; bij cloudmodus stuurt
  de helper die door naar Microsoft (Edge TTS). Geen andere hosts, geen
  telemetrie.
- Strenge CSP in de extensie; geen runtime-externe JS-dependencies.
- Bij cloudmodus gaat tekst naar Microsoft — dit wordt expliciet vermeld in
  de instellingen en installatie-instructies; "lokaal (Piper)" is één klik.

## 8. Technische randvoorwaarden

- Extensie: WebExtension, Manifest V2-background (Firefox-praktijk), code
  MV3-compatibel houden. Vanilla JS met Vite-build; geen UI-framework.
- Firefox als enig doelplatform (Linux primair; de extensie werkt
  waarschijnlijk ook op andere OS'en maar dat is geen eis).
- Dependencies: Readability.js (MPL-2.0), pdf.js (Apache-2.0), Piper
  (MIT; stemmen diverse vrije licenties); helper: FastAPI + uvicorn +
  piper-tts + websockets (Python).
- Licentie van dit project: open source (voorstel: MPL-2.0, passend bij
  Readability en Firefox-ecosysteem).

## 9. Testaanpak

- **Unit tests (Vitest):** zinsplitter, extractor (met vaste HTML-fixtures),
  engine-router met gemockte engines, instellingenlogica.
- **Integratie:** web-ext headless tegen een vaste testpagina; player-flow met
  gemockte audiolagen.
- **Helper:** pytest, inclusief één echte Piper-synthese in CI (klein stemmodel
  als testfixture) en endpoint-contracttests die de extensie-mock deelt.
- **Contract:** de response-vormen van beide engines worden als schema's
  vastgelegd zodat router en player engine-agnostisch blijven.

## 10. Fasering

1. **Fase 1 — MVP (afgerond 2026-10-24):** extensie met Edge TTS,
   Readability-extractie, playerbar, woord-/zin-highlighting,
   snelheidsregeling, instellingen, tests. Bleek bij de smoke-test
   onbruikbaar door de aangescherpte Edge TTS-beveiliging (zie §2).
2. **Fase 2 — Helper:** `tts-lnx-helper` met edge-engine (proxy) én
   piper-engine, engine-router met healthcheck en failover, engine-keuze en
   helper-status in de instellingen, automatische download van de
   Nederlandse Piper-standaardstem.
3. **Fase 3 — PDF:** eigen pdf.js-viewer-tab met extractie en highlighting.
4. **Fase 4 (optioneel):** AppImage-distributie van de helper, geschatte
   woordtiming voor Piper, selectie-voorlezen via contextmenu.
