# Ontwerp: Firefox-extensie voor natuurlijke voorleesstemmen op Linux

**Datum:** 2026-10-22
**Status:** goedgekeurd door opdrachtgever (richting + secties 1–3)
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

## 2. Gewaardeerde aanpak (hybride TTS)

De extensie werkt **direct na installatie** via de onofficiële Edge TTS API
(gratis, zeer natuurlijke neurale stemmen, o.a. `nl-NL-MaartenNeural` en
`nl-NL-FennaNeural`). Wie offline-werking en privacy wil, installeert een
kleine lokale **Piper-helper**: een daemon op `127.0.0.1` die Piper-synthese
aanbiedt. De extensie detecteert automatisch of de helper draait.

Redenen voor deze volgorde:

- Edge TTS geeft nul installatiedrempel en de beste stemkwaliteit zonder
  configuratie — dezelfde route als de populaire "Read Aloud"-extensie.
- Piper is de strategische basis: volledig lokaal, open source, en dekt alle
  gewenste Europese talen (NL, BE, DE, FR, ES, EN, IT, PL, …). De Edge TTS
  API is onofficieel en kan wijzigen; Piper maakt het product onafhankelijk.

Afgewezen alternatieven:

- **Volledig in-browser WASM-TTS** (piper-wasm / Kokoro): piper-wasm is
  experimenteel; Kokoro ondersteunt geen Nederlands of Duits — botst met de
  taleneis. Eventueel later als experiment.
- **Alleen Edge TTS:** geen offline-modus en volledig afhankelijk van één
  onofficiële API.
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
└──────┬───────────────────────┬─────────────────────┘
       │ HTTPS/WSS             │ HTTP 127.0.0.1:5020
       ▼                       ▼
  Microsoft Edge TTS      Piper-helper (optioneel):
  (cloud, standaard)      Python-daemon, FastAPI,
                          streamt WAV per zin
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

1. Gebruikersvoorkeur ("lokaal eerst" / "cloud eerst" / "alleen lokaal").
2. Beschikbaarheid: healthcheck op de helper; netwerk-check voor Edge TTS.
3. **Failover:** faalt een engine halverwege een sessie, dan schakelt de
   router over op de andere engine en leest verder vanaf de huidige zin.

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

- **Edge TTS:** de API levert word-boundary-events (`{woord, offset, duur}`)
  mee met de audiostream. Een timer zet op basis hiervan een highlight-klasse
  op het actieve woord (`tts-word`) en een achtergrond op de actieve zin
  (`tts-sentence`) — het gedrag dat Edge/Chrome-gebruikers kennen.
- **Piper:** geen woordtiming beschikbaar → highlighting op zin-niveau.
  Stretch goal: geschatte woordtiming uit relatieve woordlengtes.
- De pagina scrollt zacht mee zodra de actieve zin uit beeld dreigt te raken.

### 4.5 Instellingen

- Stemkeuze per taal (groepeerd per engine).
- Standaardsnelheid.
- Engine-voorkeur: cloud eerst / lokaal eerst / alleen lokaal.
- Helper-statuspaneel: bereikbaarheid, geïnstalleerde stemmen, download van
  extra Piper-stemmen.

### 4.6 Piper-helper

Klein Python-pakket (later ook AppImage), te installeren met
`pip install tts-lnx-helper` (naam voorbehouden):

- FastAPI-server, uitsluitend gebonden aan `127.0.0.1:5020`.
- Endpoints: `GET /health`, `GET /voices`, `POST /synthesize`
  (tekst + stem → streaming WAV), optioneel `POST /voices/download`.
- Stemmen (ONNX-modellen) in `~/.local/share/tts-lnx-helper/voices/`.
- Geen root of systemd vereist; optionele autostart via een `.desktop`-file.
- De helper schrijft geen paginatekst naar schijf; logging beperkt tot
  foutmeldingen zonder inhoud.

## 5. Dataflow tijdens voorlezen

1. **Activeren** — werkbalkknop of `Alt+R`. Content script draait Readability
   en bouwt de zinnenlijst met DOM-ankers.
2. **Player start** — playerbar verschijnt; zin 1 gaat naar de router.
   - *Edge TTS:* tekst + stem → websocket → MP3-audio + word-boundary-events.
   - *Piper:* `POST /synthesize` → WAV-stream (geen woordtiming).
3. **Afspelen + highlight** — audio speelt; word-boundaries (Edge) of
   zingrenzen (Piper) sturen de highlight; pagina scrollt zacht mee.
4. **Prefetch** — zin *n+1* wordt gesynthetiseerd terwijl *n* speelt.
5. **Bediening** — pauze/hervat, vorige/volgende zin, snelheid, stop,
   klik-op-zin.
6. **PDF** — PDF-links openen in de eigen viewer-tab; daarna identieke flow.

## 6. Foutafhandeling en edge cases

| Situatie | Gedrag |
|---|---|
| Geen internet / Edge TTS onbereikbaar | Failover naar helper; draait die niet, dan melding met installatie-instructie |
| Helper niet gevonden | Stille fallback naar cloud; statusicoon toont actieve engine |
| Onleesbare pagina | Fallback op zichtbare bodytekst; bij leeg resultaat melding "geen voorleesbare tekst gevonden" |
| Pagina wijzigt tijdens voorlezen (SPA) | Zinnenlijst is een snapshot; ankers opnieuw zoeken, lukt dat niet dan doorspelen zonder highlight |
| Taal niet herkend | Terugvallen op browsertaal; gebruiker kan overrulen |
| Engine faalt halverwege | Failover naar andere engine vanaf huidige zin |

## 7. Beveiliging en privacy

- Helper bindt alleen op `127.0.0.1`; geen externe poorten.
- Paginatekst gaat uitsluitend naar Edge TTS (bij cloudmodus) of de lokale
  helper. Geen andere hosts, geen telemetrie.
- Strenge CSP in de extensie; geen runtime-externe JS-dependencies.
- Bij cloudmodus gaat tekst naar Microsoft — dit wordt expliciet vermeld in
  de instellingen en installatie-instructies; "alleen lokaal" is één klik.

## 8. Technische randvoorwaarden

- Extensie: WebExtension, Manifest V2-background (Firefox-praktijk), code
  MV3-compatibel houden. Vanilla JS met Vite-build; geen UI-framework.
- Firefox als enig doelplatform (Linux primair; de extensie werkt
  waarschijnlijk ook op andere OS'en maar dat is geen eis).
- Dependencies: Readability.js (MPL-2.0), pdf.js (Apache-2.0), Piper
  (MIT; stemmen diverse vrije licenties).
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

1. **Fase 1 — MVP:** extensie met Edge TTS, Readability-extractie, playerbar,
   woord-/zin-highlighting, snelheidsregeling, instellingen, tests.
2. **Fase 2 — Lokaal:** Piper-helper (Python-pakket), engine-router met
   healthcheck en failover, helper-statuspaneel.
3. **Fase 3 — PDF:** eigen pdf.js-viewer-tab met extractie en highlighting.
4. **Fase 4 (optioneel):** AppImage-distributie van de helper, geschatte
   woordtiming voor Piper, selectie-voorlezen via contextmenu.
