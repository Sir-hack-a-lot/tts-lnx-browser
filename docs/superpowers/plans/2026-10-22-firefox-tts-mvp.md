# Firefox TTS-extensie MVP — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een Firefox-extensie (Linux) die webpagina's voorleest met natuurlijke neurale stemmen via Edge TTS, met woord- en zin-highlighting, playerbar en snelheidsregeling.

**Architecture:** WebExtension (Manifest V2) in vanilla JS. Het content script extraheert zinnen (Readability.js) en doet highlighting; de background page haalt audio op bij de Edge TTS websocket-API en speelt die af via een `Audio`-element (omzeilt autoplay-beperkingen). Alle modules zijn puur en testbaar; browser-API's, WebSocket en timers worden geïnjecteerd zodat alles in Vitest/jsdom te testen is.

**Tech Stack:** vanilla JS (ES2022), esbuild, Vitest + jsdom, web-ext, @mozilla/readability.

**Spec:** `docs/superpowers/specs/2026-10-22-firefox-tts-extensie-design.md`

## Global Constraints

- Identifiers in **English**; comments, docs en commit messages in **Nederlands**.
- Elke commit message eindigt met de regel: `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- Manifest V2, `strict_min_version` "109.0", alleen Firefox.
- Geen UI-framework, geen runtime-externe JS — alle dependencies worden meegebundeld.
- Netwerkverkeer uitsluitend naar `speech.platform.bing.com` (MVP); geen telemetrie.
- UI-teksten hardcoded Nederlands (i18n is geen MVP-eis).
- `npm test` (Vitest) moet groen zijn vóór elke commit.
- Commit + push aan het einde van elke werksessie.
- Werk op branch `main` (solo-project), één commit per taak.

## Bestandsstructuur

```
extension/
  manifest.json               — MV2 manifest
  icons/icon.svg              — luidspreker-icoon
  shared/messages.js          — berichttypen content ↔ background
  shared/settings.js          — browser.storage.local-wrapper met defaults
  shared/voices.js            — samengestelde stemmenlijst + resolveVoice()
  background/background.js    — entry: berichtenrouter, player-aansturing
  background/audio-player.js  — Audio-element-adapter (dun; handmatig getest)
  background/player.js        — player-statemachine (puur, geïnjecteerde deps)
  background/engines/edge-protocol.js — pure protocolfuncties (berichten bouwen/parsen)
  background/engines/edge-tts.js      — websocket-orchestratie (geïnjecteerde WebSocket)
  content/content.js          — entry: wiring, events → highlight
  content/extractor.js        — Readability-extractie + locateSentence()
  content/sentence-split.js   — zinsplitsing
  content/language-detect.js  — stopwoord-heuristiek NL/EN/DE/FR/ES
  content/highlighter.js      — span-wrapping voor zin/woord
  content/playerbar.js        — bedieningsbalk in closed shadow DOM
  options/options.html        — instellingenpagina
  options/options.js          — laadt/slaat instellingen op
scripts/build.js              — esbuild-bundel naar dist/
tests/                        — Vitest, spiegelt extension/-structuur
tests/fixtures/article.html   — vaste testpagina
tests/fixtures/edge-frames.js — helpers om protocol-frames te bouwen
```

## Interfaces (taken onderling)

- `splitSentences(text: string): string[]` — content/sentence-split.js (Task 2)
- `detectLanguage(text: string): 'nl'|'en'|'de'|'fr'|'es'|null` — content/language-detect.js (Task 3)
- `VOICES: Record<string, string[]>`, `resolveVoice(lang, voiceOverrides): string` — shared/voices.js (Task 3)
- `generateConnectionId(): string`, `computeSecMsGec(nowMs): Promise<string>`, `buildWssUrl({connectionId, secMsGec}): string`, `buildConfigMessage(): string`, `buildSsmlMessage({text, voice, ratePct, requestId}): string`, `rateToPct(rate): string`, `parseBinaryFrame(buf): {path, payload: Uint8Array}`, `parseTextFrame(str): {path, body}`, `extractWordBoundaries(jsonBody): [{text, offsetMs, durationMs}]` — background/engines/edge-protocol.js (Task 4)
- `createEdgeEngine({WebSocketImpl?, timeoutMs?, now?}): {name:'edge', isLocal:false, available(): Promise<boolean>, synthesize({text, voice, rate}): Promise<{audio: Blob, boundaries: [{text, offsetMs, durationMs}]}>}` — Task 5. **De Piper-helper (fase 2) implementeert exact deze engine-interface.**
- `extractArticle(doc, {maxSentences?}): {title: string|null, sentences: [{id: number, text: string}]}` en `locateSentence(doc, sentenceText, {fromNode?, fromOffset?}): [{node: Text, start: number, end: number}]|null` — `fromOffset` is de ruwe offset in `fromNode` vanaf waar gezocht wordt (nodig bij herhaalde zinnen in dezelfde tekstnode) — content/extractor.js (Task 6)
- `createHighlighter(doc): {setSentence(segments): void, highlightWord(wordText, fromPos): number, clear(): void}` — content/highlighter.js (Task 7)
- `createSettings(storage): {load(): Promise<object>, get(key), set(patch): Promise<object>}` met `DEFAULTS = {rate: 1, enginePref: 'cloud', voiceOverrides: {}}` — shared/settings.js (Task 8)
- `createPlayer({engine, audio, onEvent, setIntervalImpl?, clearIntervalImpl?, progressMs?}): {start({sentences, voice, rate}), pause(), resume(), stop(), seek(i), setRate(r), currentIndex(): number}` — background/player.js (Task 9). Events via `onEvent`: `{type:'sentence-start', index, boundaries}`, `{type:'sentence-end', index}`, `{type:'progress', index, elapsedMs}`, `{type:'end'}`, `{type:'error', message}`, `{type:'state', state}`. De `audio`-adapter heeft: `play(blob): Promise<void>` (resolveert bij einde), `pause()`, `resume()`, `stop()`, `currentTimeMs(): number`.
- `createAudioPlayer(): <audio-adapter>` — background/audio-player.js (Task 10)
- `createPlayerBar(doc, {onControl}): {el, setPlaying(bool), destroy()}` — content/playerbar.js (Task 11). `onControl(action, value?)` met actions uit `CONTROL`.

---

### Task 1: Projectscaffolding + laadbare hello-world-extensie

**Files:**
- Create: `package.json`, `vitest.config.js`, `scripts/build.js`, `.gitignore`
- Create: `extension/manifest.json`, `extension/icons/icon.svg`
- Create: `extension/shared/messages.js`
- Create: `extension/background/background.js` (tijdelijke entry), `extension/content/content.js` (tijdelijke entry), `extension/options/options.html`, `extension/options/options.js`
- Test: `tests/messages.test.js`

**Interfaces:**
- Produces: `MSG` ({TOGGLE, START, CONTROL, EVENT}) en `CONTROL` ({PAUSE, RESUME, NEXT, PREV, STOP, SEEK, RATE}) uit `extension/shared/messages.js` — alle latere taken gebruiken deze constanten.

- [ ] **Step 1: Maak package.json, vitest.config.js, .gitignore**

`package.json`:
```json
{
  "name": "tts-lnx-browser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Firefox-extensie die webpagina's voorleest met natuurlijke stemmen",
  "scripts": {
    "build": "node scripts/build.js",
    "test": "vitest run",
    "lint": "web-ext lint --source-dir dist",
    "start": "web-ext run --source-dir dist",
    "package": "web-ext build --source-dir dist --artifacts-dir web-ext-artifacts"
  },
  "devDependencies": {
    "@mozilla/readability": "^0.5.0",
    "esbuild": "^0.21.5",
    "jsdom": "^24.1.0",
    "vitest": "^2.1.0",
    "web-ext": "^8.3.0"
  }
}
```

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

// DOM-tests zetten bovenaan: // @vitest-environment jsdom
export default defineConfig({ test: { environment: 'node' } });
```

`.gitignore`:
```
node_modules/
dist/
web-ext-artifacts/
```

- [ ] **Step 2: Maak build-script**

`scripts/build.js`:
```js
// Bundelt de extensie naar dist/ met esbuild.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const shared = { bundle: true, format: 'iife', target: 'firefox109', sourcemap: true };
await build({ ...shared, entryPoints: ['extension/background/background.js'], outfile: 'dist/background/background.js' });
await build({ ...shared, entryPoints: ['extension/content/content.js'], outfile: 'dist/content/content.js' });
await build({ ...shared, entryPoints: ['extension/options/options.js'], outfile: 'dist/options/options.js' });
await cp('extension/manifest.json', 'dist/manifest.json');
await cp('extension/options/options.html', 'dist/options/options.html');
await cp('extension/icons', 'dist/icons', { recursive: true });
console.log('Build OK → dist/');
```

- [ ] **Step 3: Maak manifest, icoon en shared/messages.js**

`extension/manifest.json`:
```json
{
  "manifest_version": 2,
  "name": "TTS LNX Browser",
  "version": "0.1.0",
  "description": "Leest webpagina's voor met natuurlijke stemmen op Linux.",
  "permissions": ["storage", "https://speech.platform.bing.com/"],
  "background": { "scripts": ["background/background.js"] },
  "browser_action": { "default_icon": "icons/icon.svg", "default_title": "Lees pagina voor" },
  "content_scripts": [
    { "matches": ["http://*/*", "https://*/*"], "js": ["content/content.js"], "run_at": "document_idle" }
  ],
  "options_ui": { "page": "options/options.html", "browser_style": true },
  "icons": { "48": "icons/icon.svg", "96": "icons/icon.svg" },
  "browser_specific_settings": { "gecko": { "id": "tts-lnx-browser@localhost", "strict_min_version": "109.0" } }
}
```

`extension/icons/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="8" fill="#263238"/>
  <path d="M10 20v8h6l8 8V12l-8 8h-6z" fill="#ffd54f"/>
  <path d="M28 17c2 2 3 4.5 3 7s-1 5-3 7" stroke="#ffd54f" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M33 12c3.5 3.5 5 7.5 5 12s-1.5 8.5-5 12" stroke="#ffd54f" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>
```

`extension/shared/messages.js`:
```js
// Berichttypen tussen content script en background page.
export const MSG = {
  TOGGLE: 'tts.toggle',   // background → content: werkbalkknop/sneltoets ingedrukt
  START: 'tts.start',     // content → background: {sentences, lang}
  CONTROL: 'tts.control', // content → background: {action, value?}
  EVENT: 'tts.event',     // background → content: {event}
};

export const CONTROL = {
  PAUSE: 'pause', RESUME: 'resume', NEXT: 'next', PREV: 'prev',
  STOP: 'stop', SEEK: 'seek', RATE: 'rate',
};
```

- [ ] **Step 4: Schrijf de falende test**

`tests/messages.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { MSG, CONTROL } from '../extension/shared/messages.js';

describe('messages', () => {
  it('heeft unieke berichttypen', () => {
    const values = Object.values(MSG);
    expect(new Set(values).size).toBe(values.length);
  });
  it('heeft alle control-actions', () => {
    expect(CONTROL).toMatchObject({ PAUSE: 'pause', RESUME: 'resume', NEXT: 'next', PREV: 'prev', STOP: 'stop', SEEK: 'seek', RATE: 'rate' });
  });
});
```

- [ ] **Step 5: Draai de test — moet FALEN**

Run: `npm install && npm test`
Expected: FAIL (`Cannot find module '../extension/shared/messages.js'`) — daarna bestaat messages.js al uit step 3, dus herschik: draai `npm test` vóór step 3 of verwacht PASS na install. In de praktijk: draai hier `npm install` en verwacht dat de test faalt zolang messages.js ontbreekt; maak daarna step 3 af en ga verder.

- [ ] **Step 6: Maak tijdelijke entries (hello world)**

`extension/background/background.js`:
```js
// Tijdelijke MVP-entry; wordt in latere taken uitgebouwd.
import { MSG } from '../shared/messages.js';

browser.browserAction.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, { type: MSG.TOGGLE }).catch(() => {});
});
```

`extension/content/content.js`:
```js
// Tijdelijke MVP-entry: toont een balk als bewijs dat de extensie laadt.
import { MSG } from '../shared/messages.js';

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type !== MSG.TOGGLE) return;
  const el = document.createElement('div');
  el.textContent = 'TTS-extensie actief';
  el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#263238;color:#fff;padding:8px;z-index:2147483647;text-align:center;font:14px sans-serif';
  document.body.appendChild(el);
});
```

`extension/options/options.html`:
```html
<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>TTS-instellingen</title></head>
<body><h1>Voorlees-instellingen</h1><p>Wordt in een latere taak uitgebouwd.</p><script src="options.js"></script></body>
</html>
```

`extension/options/options.js`:
```js
// Wordt in de instellingen-taak uitgebouwd.
```

- [ ] **Step 7: Verifieer**

Run: `npm test` → PASS. Run: `npm run build` → "Build OK → dist/". Run: `npm run lint` → geen errors.
Handmatig (als desktop beschikbaar): `npm start`, open een willekeurige pagina, klik de werkbalkknop → balk "TTS-extensie actief" verschijnt.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffolding: laadbare hello-world-extensie met esbuild + Vitest

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```


---

### Task 2: Zinsplitsing (`content/sentence-split.js`)

**Files:**
- Create: `extension/content/sentence-split.js`
- Test: `tests/sentence-split.test.js`

**Interfaces:**
- Produces: `splitSentences(text: string): string[]` — genormaliseerde zinnen (whitespace genormaliseerd, getrimd), in volgorde.

- [ ] **Step 1: Schrijf de falende test**

`tests/sentence-split.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { splitSentences } from '../extension/content/sentence-split.js';

describe('splitSentences', () => {
  it('splitst twee gewone zinnen', () => {
    expect(splitSentences('Hallo wereld. Hoe gaat het?')).toEqual(['Hallo wereld.', 'Hoe gaat het?']);
  });
  it('beschermt afkortingen', () => {
    expect(splitSentences('Dr. Jansen werkt bij de UvA. Hij is er klaar mee.'))
      .toEqual(['Dr. Jansen werkt bij de UvA.', 'Hij is er klaar mee.']);
  });
  it('beschermt decimalen', () => {
    expect(splitSentences('De prijs is 3.50 euro. Duur!')).toEqual(['De prijs is 3.50 euro.', 'Duur!']);
  });
  it('beschermt URL\'s', () => {
    expect(splitSentences('Kijk op https://nu.nl voor meer. Tot ziens.'))
      .toEqual(['Kijk op https://nu.nl voor meer.', 'Tot ziens.']);
  });
  it('behandelt ellipsis als deel van de zin', () => {
    expect(splitSentences('Wacht even... oké nu.')).toEqual(['Wacht even... oké nu.']);
  });
  it('sluit aanhalingstekens en haakjes bij de zin in', () => {
    expect(splitSentences('Hij zei: "Kom hier!" en liep weg.'))
      .toEqual(['Hij zei: "Kom hier!"', 'en liep weg.']);
  });
  it('normaliseert whitespace', () => {
    expect(splitSentences('Eerste   zin.\n\nTweede   zin.')).toEqual(['Eerste zin.', 'Tweede zin.']);
  });
  it('geeft lege array bij lege invoer', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/sentence-split.test.js`
Expected: FAIL (`Cannot find module ... sentence-split.js`)

- [ ] **Step 3: Implementatie**

`extension/content/sentence-split.js`:
```js
// Splitst tekst in zinnen. Beschermt afkortingen, decimalen, URL's en ellipsis
// door punten tijdelijk te vervangen door PROTECT voor het splitsen.
const ABBR = new Set([
  'dr', 'dhr', 'mr', 'mevr', 'mw', 'ir', 'ing', 'drs', 'prof', 'lic',
  'bijv', 'etc', 'enz', 'ca', 'nr', 'blz', 'hfst', 'pag', 'vs', 'vgl',
  'fig', 'st', 'no', 'jr', 'sr', 'inc', 'ltd', 'co', 'tov', 'oa',
]);

// Controlekarakter als placeholder; komt niet in normale tekst voor.
const PROTECT = String.fromCharCode(1);

export function splitSentences(text) {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return [];

  const protectedSrc = src
    .replace(/https?:\/\/\S+/g, (m) => m.replace(/[.!?]/g, PROTECT))
    .replace(/\d+(?:[.,]\d+)+/g, (m) => m.replace(/\./g, PROTECT))
    .replace(/\.\.\./g, `${PROTECT}${PROTECT}${PROTECT}`)
    .replace(/\b([A-Za-zÀ-ÿ]{1,10})\.(?=\s|$)/g, (m, w) =>
      ABBR.has(w.toLowerCase()) ? w + PROTECT : m);

  const parts = protectedSrc.match(/[^.!?]+[.!?]+["'”’)\]]*\s*|[^.!?]+$/g) || [];
  return parts
    .map((s) => s.replaceAll(PROTECT, '.').trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/sentence-split.test.js`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/content/sentence-split.js tests/sentence-split.test.js
git commit -m "Zinsplitsing met bescherming voor afkortingen, decimalen en URL's

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Taaldetectie + stemmenlijst

**Files:**
- Create: `extension/content/language-detect.js`
- Create: `extension/shared/voices.js`
- Test: `tests/language-detect.test.js`, `tests/voices.test.js`

**Interfaces:**
- Produces: `detectLanguage(text): 'nl'|'en'|'de'|'fr'|'es'|null`
- Produces: `VOICES: Record<lang, string[]>`, `DEFAULT_LANG = 'nl'`, `resolveVoice(lang, voiceOverrides = {}): string`

- [ ] **Step 1: Schrijf de falende tests**

`tests/language-detect.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../extension/content/language-detect.js';

describe('detectLanguage', () => {
  it('herkent Nederlands', () => {
    expect(detectLanguage('Dit is een Nederlandse zin die niet moeilijk is, en die we met het bloot oog kunnen lezen omdat de woorden heel gewoon zijn.')).toBe('nl');
  });
  it('herkent Engels', () => {
    expect(detectLanguage('This is an English sentence that is not difficult, and that you can read with the naked eye because the words are very common.')).toBe('en');
  });
  it('herkent Duits', () => {
    expect(detectLanguage('Dies ist ein deutscher Satz, der nicht schwer ist, und den man mit blosssem Auge lesen kann, weil die Wörter sehr gewöhnlich sind.')).toBe('de');
  });
  it('geeft null bij te weinig woorden', () => {
    expect(detectLanguage('Hallo wereld')).toBe(null);
  });
});
```

`tests/voices.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { VOICES, DEFAULT_LANG, resolveVoice } from '../extension/shared/voices.js';

describe('voices', () => {
  it('heeft stemmen voor alle MVP-talen', () => {
    for (const lang of ['nl', 'en', 'de', 'fr', 'es']) {
      expect(VOICES[lang]?.length).toBeGreaterThan(0);
    }
  });
  it('resolveVoice gebruikt de eerste stem van de taal', () => {
    expect(resolveVoice('nl', {})).toBe(VOICES.nl[0]);
  });
  it('resolveVoice respecteert een override', () => {
    expect(resolveVoice('nl', { nl: 'nl-NL-MaartenNeural' })).toBe('nl-NL-MaartenNeural');
  });
  it('resolveVoice valt terug op DEFAULT_LANG bij onbekende taal', () => {
    expect(resolveVoice('ja', {})).toBe(VOICES[DEFAULT_LANG][0]);
  });
});
```

- [ ] **Step 2: Draai de tests — moeten FALEN**

Run: `npx vitest run tests/language-detect.test.js tests/voices.test.js`
Expected: FAIL (modules ontbreken)

- [ ] **Step 3: Implementatie**

`extension/content/language-detect.js`:
```js
// Heuristische taaldetectie op basis van stopwoordfrequentie.
// Voldoende voor paginataal; korte teksten geven null (caller valt terug).
const STOPWORDS = {
  nl: ['de', 'het', 'een', 'en', 'van', 'ik', 'je', 'dat', 'die', 'niet', 'aan', 'voor', 'zijn', 'met', 'maar', 'ook', 'deze', 'wordt', 'we', 'omdat', 'heel'],
  en: ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'this', 'are', 'very'],
  de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'auf', 'für', 'ist', 'im', 'nicht', 'ein', 'eine', 'auch', 'man', 'weil'],
  fr: ['le', 'de', 'un', 'être', 'et', 'à', 'il', 'avoir', 'ne', 'je', 'son', 'que', 'se', 'qui', 'dans', 'pour', 'pas', 'les', 'une', 'des'],
  es: ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'ser', 'se', 'no', 'haber', 'por', 'con', 'su', 'para', 'como', 'estar', 'los', 'las', 'una'],
};

export function detectLanguage(text) {
  const words = String(text ?? '').toLowerCase().match(/[a-zà-ÿ]+/gi) ?? [];
  if (words.length < 10) return null;
  let best = null;
  let bestScore = 0;
  for (const [lang, stops] of Object.entries(STOPWORDS)) {
    const set = new Set(stops);
    const score = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0) / words.length;
    if (score > bestScore) { best = lang; bestScore = score; }
  }
  return bestScore >= 0.05 ? best : null;
}
```

`extension/shared/voices.js`:
```js
// Samengestelde lijst van Edge TTS neurale stemmen, gerankt op voorkeur.
// (Fase 2 voegt Piper-stemmen van de helper toe via dezelfde interface.)
export const VOICES = {
  nl: ['nl-NL-FennaNeural', 'nl-NL-MaartenNeural', 'nl-NL-ColetteNeural'],
  en: ['en-US-JennyNeural', 'en-GB-SoniaNeural', 'en-US-GuyNeural'],
  de: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
  fr: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
  es: ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
};

export const DEFAULT_LANG = 'nl';

// Bepaalt de te gebruiken stem: override > eerste stem van de taal > DEFAULT_LANG.
export function resolveVoice(lang, voiceOverrides = {}) {
  const known = VOICES[lang] ? lang : DEFAULT_LANG;
  return voiceOverrides[known] || VOICES[known][0];
}
```

- [ ] **Step 4: Draai de tests — moeten PASSEN**

Run: `npx vitest run tests/language-detect.test.js tests/voices.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/content/language-detect.js extension/shared/voices.js tests/language-detect.test.js tests/voices.test.js
git commit -m "Taaldetectie (stopwoord-heuristiek) en samengestelde stemmenlijst

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```


---

### Task 4: Edge TTS protocol (`background/engines/edge-protocol.js`)

Pure functies voor het onofficiële Edge TTS websocket-protocol: berichten bouwen, frames parsen, DRM-token (Sec-MS-GEC) berekenen. Geen netwerk — alles is unit-testbaar.

**Files:**
- Create: `extension/background/engines/edge-protocol.js`
- Test: `tests/edge-protocol.test.js`
- Test-fixture: `tests/fixtures/edge-frames.js`

**Interfaces:**
- Produces: `TRUSTED_CLIENT_TOKEN`, `SEC_MS_GEC_VERSION`, `OUTPUT_FORMAT`
- Produces: `generateConnectionId(): string` — 32 hex-karakters, geen streepjes
- Produces: `computeSecMsGec(nowMs: number): Promise<string>` — 64 uppercase hex
- Produces: `buildWssUrl({connectionId, secMsGec}): string`
- Produces: `buildConfigMessage(): string`
- Produces: `rateToPct(rate: number): string` — clamp 0.5–2.0 → '-50%'..'+100%'
- Produces: `buildSsmlMessage({text, voice, ratePct, requestId}): string` — XML-escaped tekst
- Produces: `parseBinaryFrame(buf: ArrayBuffer): {path: string, payload: Uint8Array}`
- Produces: `parseTextFrame(str: string): {path: string, body: string}`
- Produces: `extractWordBoundaries(jsonBody: string): [{text: string, offsetMs: number, durationMs: number}]`

- [ ] **Step 1: Schrijf fixture-helpers en de falende tests**

`tests/fixtures/edge-frames.js`:
```js
// Helpers om Edge TTS protocol-frames na te bouwen in tests.
export function buildTextFrame(path, body) {
  return `X-RequestId:abc123\r\nContent-Type:application/json; charset=utf-8\r\nPath:${path}\r\n\r\n${body}`;
}

export function buildBinaryFrame(path, payload) {
  const header = new TextEncoder().encode(`X-RequestId:abc123\r\nPath:${path}\r\n\r\n`);
  const buf = new Uint8Array(2 + header.length + payload.length);
  new DataView(buf.buffer).setUint16(0, header.length); // big-endian headerlengte
  buf.set(header, 2);
  buf.set(payload, 2 + header.length);
  return buf.buffer;
}
```

`tests/edge-protocol.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  TRUSTED_CLIENT_TOKEN, generateConnectionId, computeSecMsGec, buildWssUrl,
  buildConfigMessage, rateToPct, buildSsmlMessage,
  parseBinaryFrame, parseTextFrame, extractWordBoundaries,
} from '../extension/background/engines/edge-protocol.js';
import { buildBinaryFrame, buildTextFrame } from './fixtures/edge-frames.js';

describe('generateConnectionId', () => {
  it('geeft 32 hex-karakters zonder streepjes', () => {
    const id = generateConnectionId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(generateConnectionId()).not.toBe(id);
  });
});

describe('computeSecMsGec', () => {
  it('is 64 uppercase hex en deterministisch per 5-minutenvenster', async () => {
    const now = new Date('2026-10-22T12:34:56Z').getTime();
    const a = await computeSecMsGec(now);
    expect(a).toMatch(/^[0-9A-F]{64}$/);
    expect(await computeSecMsGec(now + 60_000)).toBe(a);          // zelfde venster
    expect(await computeSecMsGec(now + 6 * 60_000)).not.toBe(a);  // volgend venster
  });
  it('volgt het gedocumenteerde algoritme (onafhankelijke herberekening)', async () => {
    const now = new Date('2026-10-22T12:34:56Z').getTime();
    const WIN_EPOCH = 11644473600;
    let ticks = Math.floor(now / 1000) + WIN_EPOCH;
    ticks -= ticks % 300;
    const input = `${BigInt(ticks) * 10_000_000n}${TRUSTED_CLIENT_TOKEN}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const expected = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    expect(await computeSecMsGec(now)).toBe(expected);
  });
});

describe('buildWssUrl', () => {
  it('bevat token, gec en connection-id', () => {
    const url = buildWssUrl({ connectionId: 'c1', secMsGec: 'g1' });
    expect(url).toContain('wss://speech.platform.bing.com/');
    expect(url).toContain(`TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`);
    expect(url).toContain('Sec-MS-GEC=g1');
    expect(url).toContain('ConnectionId=c1');
  });
});

describe('buildConfigMessage', () => {
  it('vraagt woordgrenzen en mp3-output aan', () => {
    const msg = buildConfigMessage();
    expect(msg).toContain('Path:speech.config');
    expect(msg).toContain('"wordBoundaryEnabled":"true"');
    expect(msg).toContain('audio-24khz-48kbitrate-mono-mp3');
  });
});

describe('rateToPct', () => {
  it('zet snelheid om naar procent-string', () => {
    expect(rateToPct(1)).toBe('+0%');
    expect(rateToPct(1.25)).toBe('+25%');
    expect(rateToPct(0.5)).toBe('-50%');
  });
  it('clampt op 0.5–2.0', () => {
    expect(rateToPct(0.1)).toBe('-50%');
    expect(rateToPct(3)).toBe('+100%');
  });
});

describe('buildSsmlMessage', () => {
  it('bevat stem, rate en ge-escapete tekst', () => {
    const msg = buildSsmlMessage({ text: '5 & 6 <test>', voice: 'nl-NL-FennaNeural', ratePct: '+25%', requestId: 'r1' });
    expect(msg).toContain('Path:ssml');
    expect(msg).toContain('X-RequestId:r1');
    expect(msg).toContain("name='nl-NL-FennaNeural'");
    expect(msg).toContain("rate='+25%'");
    expect(msg).toContain('5 &amp; 6 &lt;test&gt;');
  });
});

describe('parseBinaryFrame', () => {
  it('splitst header en payload', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const { path, payload: out } = parseBinaryFrame(buildBinaryFrame('audio', payload));
    expect(path).toBe('audio');
    expect([...out]).toEqual([1, 2, 3]);
  });
});

describe('parseTextFrame', () => {
  it('splitst header en body', () => {
    const { path, body } = parseTextFrame(buildTextFrame('turn.end', '{}'));
    expect(path).toBe('turn.end');
    expect(body).toBe('{}');
  });
});

describe('extractWordBoundaries', () => {
  it('zet 100ns-eenheden om naar milliseconden', () => {
    const body = JSON.stringify({ Metadata: [
      { Type: 'WordBoundary', Data: { Offset: 500000, Duration: 3000000, text: { Text: 'Hallo', Length: 5 } } },
      { Type: 'WordBoundary', Data: { Offset: 4000000, Duration: 2000000, text: { Text: 'wereld', Length: 6 } } },
      { Type: 'SentenceBoundary', Data: {} },
    ]});
    expect(extractWordBoundaries(body)).toEqual([
      { text: 'Hallo', offsetMs: 50, durationMs: 300 },
      { text: 'wereld', offsetMs: 400, durationMs: 200 },
    ]);
  });
  it('geeft lege array bij ontbrekende metadata', () => {
    expect(extractWordBoundaries('{}')).toEqual([]);
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/edge-protocol.test.js`
Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/background/engines/edge-protocol.js`:
```js
// Pure functies voor het onofficiële Edge TTS websocket-protocol.
// Zie https://github.com/rany2/edge-tts voor de referentie-implementatie.

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
// DRM-versie van de Edge-build; bij 403-fouten deze opnieuw afleiden van een actuele Edge-versie.
export const SEC_MS_GEC_VERSION = '1-131.0.2903.99';
export const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const WIN_EPOCH_SECONDS = 11644473600; // seconden tussen 1-1-1601 en 1-1-1970

export function generateConnectionId() {
  // 32 hex-karakters (uuid zonder streepjes); crypto.getRandomValues is overal beschikbaar.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeSecMsGec(nowMs = Date.now()) {
  let ticks = Math.floor(nowMs / 1000) + WIN_EPOCH_SECONDS;
  ticks -= ticks % 300; // afronden naar 5-minutenvenster
  const input = `${BigInt(ticks) * 10_000_000n}${TRUSTED_CLIENT_TOKEN}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function buildWssUrl({ connectionId, secMsGec }) {
  return 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
    + `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`
    + `&Sec-MS-GEC=${secMsGec}`
    + `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}`
    + `&ConnectionId=${connectionId}`;
}

export function buildConfigMessage() {
  return `X-Timestamp:${new Date().toISOString()}\r\n`
    + 'Content-Type:application/json; charset=utf-8\r\n'
    + 'Path:speech.config\r\n\r\n'
    + JSON.stringify({
        context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
          outputFormat: OUTPUT_FORMAT,
        } } },
      });
}

export function rateToPct(rate) {
  const clamped = Math.min(2, Math.max(0.5, rate));
  const pct = Math.round((clamped - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function escapeXml(s) {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function buildSsmlMessage({ text, voice, ratePct, requestId }) {
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='nl-NL'>`
    + `<voice name='${voice}'><prosody pitch='+0Hz' rate='${ratePct}' volume='+0%'>`
    + `${escapeXml(text)}</prosody></voice></speak>`;
  return `X-RequestId:${requestId}\r\n`
    + 'Content-Type:application/ssml+xml\r\n'
    + `X-Timestamp:${new Date().toISOString()}\r\n`
    + `Path:ssml\r\n\r\n${ssml}`;
}

// Binair frame: 2 bytes big-endian headerlengte, dan ascii-headers, dan payload.
export function parseBinaryFrame(buf) {
  const view = new DataView(buf);
  const headerLen = view.getUint16(0);
  const headerText = new TextDecoder().decode(new Uint8Array(buf, 2, headerLen));
  const path = /Path:([^\r\n]+)/.exec(headerText)?.[1] ?? '';
  return { path, payload: new Uint8Array(buf, 2 + headerLen) };
}

// Tekstframe: headers en body gescheiden door een lege regel.
export function parseTextFrame(str) {
  const idx = str.indexOf('\r\n\r\n');
  const headers = idx >= 0 ? str.slice(0, idx) : str;
  const body = idx >= 0 ? str.slice(idx + 4) : '';
  const path = /Path:([^\r\n]+)/.exec(headers)?.[1] ?? '';
  return { path, body };
}

// WordBoundary-metadata: Offset/Duration in 100ns-eenheden → milliseconden.
export function extractWordBoundaries(jsonBody) {
  let parsed;
  try { parsed = JSON.parse(jsonBody); } catch { return []; }
  return (parsed.Metadata ?? [])
    .filter((m) => m.Type === 'WordBoundary' && m.Data?.text?.Text != null)
    .map((m) => ({
      text: m.Data.text.Text,
      offsetMs: Math.round(m.Data.Offset / 10000),
      durationMs: Math.round(m.Data.Duration / 10000),
    }));
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/edge-protocol.test.js`
Expected: PASS (alle describes)

- [ ] **Step 5: Commit**

```bash
git add extension/background/engines/edge-protocol.js tests/edge-protocol.test.js tests/fixtures/edge-frames.js
git commit -m "Edge TTS protocol: berichtbouw, frame-parsing en Sec-MS-GEC-token

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Edge TTS engine (`background/engines/edge-tts.js`)

Websocket-orchestratie rond edge-protocol: verstuurt config + SSML, verzamelt audio-chunks en woordgrenzen, resolveert bij `turn.end`. WebSocket wordt geïnjecteerd voor testbaarheid.

**Files:**
- Create: `extension/background/engines/edge-tts.js`
- Test: `tests/edge-tts.test.js`

**Interfaces:**
- Consumes: alle exports van Task 4.
- Produces: `createEdgeEngine({WebSocketImpl?, timeoutMs?, now?}): {name: 'edge', isLocal: false, available(): Promise<boolean>, synthesize({text, voice, rate}): Promise<{audio: Blob, boundaries: Array}>}` — **dit is de engine-interface die de Piper-helper in fase 2 ook implementeert.**

- [ ] **Step 1: Schrijf de falende test**

`tests/edge-tts.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createEdgeEngine } from '../extension/background/engines/edge-tts.js';
import { buildBinaryFrame, buildTextFrame } from './fixtures/edge-frames.js';

// Nep-websocket die frames afspeelt zodra de SSML verstuurd is.
class FakeWebSocket {
  constructor(url) { this.url = url; this.sent = []; FakeWebSocket.last = this; }
  send(msg) {
    this.sent.push(msg);
    if (msg.includes('Path:ssml')) {
      const metadata = JSON.stringify({ Metadata: [
        { Type: 'WordBoundary', Data: { Offset: 0, Duration: 3000000, text: { Text: 'Hallo', Length: 5 } } },
      ]});
      setTimeout(() => {
        this.onmessage({ data: buildTextFrame('audio.metadata', metadata) });
        this.onmessage({ data: buildBinaryFrame('audio', new Uint8Array([1, 2])) });
        this.onmessage({ data: buildBinaryFrame('audio', new Uint8Array([3])) });
        this.onmessage({ data: buildTextFrame('turn.end', '{}') });
      }, 0);
    }
  }
  close() { this.closed = true; }
}

describe('createEdgeEngine', () => {
  it('stuurt config + ssml en levert audio met woordgrenzen', async () => {
    const engine = createEdgeEngine({ WebSocketImpl: FakeWebSocket, now: () => 0 });
    const result = await engine.synthesize({ text: 'Hallo', voice: 'nl-NL-FennaNeural', rate: 1.25 });
    const ws = FakeWebSocket.last;
    expect(ws.sent[0]).toContain('Path:speech.config');
    expect(ws.sent[1]).toContain('Path:ssml');
    expect(ws.sent[1]).toContain("rate='+25%'");
    expect(await result.audio.text().then(() => result.audio.size)).toBe(3);
    expect(result.audio.type).toBe('audio/mpeg');
    expect(result.boundaries).toEqual([{ text: 'Hallo', offsetMs: 0, durationMs: 300 }]);
  });

  it('reject bij timeout als turn.end uitblijft', async () => {
    class SilentWS {
      constructor() { this.sent = []; }
      send() {}
      close() {}
    }
    const engine = createEdgeEngine({ WebSocketImpl: SilentWS, timeoutMs: 20, now: () => 0 });
    await expect(engine.synthesize({ text: 'x', voice: 'nl-NL-FennaNeural', rate: 1 }))
      .rejects.toThrow('timeout');
  });

  it('reject bij websocket-fout', async () => {
    class ErrorWS {
      constructor() { setTimeout(() => this.onerror?.(new Error('kapot')), 0); }
      send() {}
      close() {}
    }
    const engine = createEdgeEngine({ WebSocketImpl: ErrorWS, now: () => 0 });
    await expect(engine.synthesize({ text: 'x', voice: 'nl-NL-FennaNeural', rate: 1 }))
      .rejects.toThrow('websocket');
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/edge-tts.test.js`
Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/background/engines/edge-tts.js`:
```js
// Websocket-orchestratie voor Edge TTS. WebSocket wordt geïnjecteerd zodat
// deze module zonder netwerk te testen is.
import {
  buildWssUrl, buildConfigMessage, buildSsmlMessage, generateConnectionId,
  computeSecMsGec, parseBinaryFrame, parseTextFrame, extractWordBoundaries, rateToPct,
} from './edge-protocol.js';

export function createEdgeEngine({ WebSocketImpl = globalThis.WebSocket, timeoutMs = 15000, now = () => Date.now() } = {}) {
  return {
    name: 'edge',
    isLocal: false,

    async available() {
      return typeof navigator === 'undefined' ? true : navigator.onLine;
    },

    async synthesize({ text, voice, rate = 1 }) {
      const secMsGec = await computeSecMsGec(now());
      const url = buildWssUrl({ connectionId: generateConnectionId(), secMsGec });
      const requestId = generateConnectionId();

      return new Promise((resolve, reject) => {
        const chunks = [];
        const boundaries = [];
        let settled = false;

        const ws = new WebSocketImpl(url);
        ws.binaryType = 'arraybuffer';
        const timer = setTimeout(() => settle(new Error('Edge TTS timeout')), timeoutMs);

        function settle(err, result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch { /* negeren */ }
          if (err) reject(err); else resolve(result);
        }

        function done() {
          settle(null, { audio: new Blob(chunks, { type: 'audio/mpeg' }), boundaries });
        }

        ws.onopen = () => {
          ws.send(buildConfigMessage());
          ws.send(buildSsmlMessage({ text, voice, ratePct: rateToPct(rate), requestId }));
        };
        ws.onerror = () => settle(new Error('Edge TTS websocket-fout'));
        ws.onmessage = (ev) => {
          try {
            if (typeof ev.data === 'string') {
              const { path, body } = parseTextFrame(ev.data);
              if (path === 'audio.metadata') boundaries.push(...extractWordBoundaries(body));
              else if (path === 'turn.end') done();
            } else {
              const { path, payload } = parseBinaryFrame(ev.data);
              if (path === 'audio') chunks.push(payload);
              else if (path === 'turn.end') done();
            }
          } catch (err) {
            settle(err);
          }
        };
      });
    },
  };
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/edge-tts.test.js`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/background/engines/edge-tts.js tests/edge-tts.test.js
git commit -m "Edge TTS engine: websocket-orchestratie met injecteerbare WebSocket

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```


---

### Task 6: Artikelextractie (`content/extractor.js`)

Readability-extractie naar een zinnenlijst, plus `locateSentence()` die een zin terugvindt in de originele pagina als tekstsegmenten voor highlighting. Readability draait op een **kloon** van het document; highlighting-ankers worden apart opgezocht in het origineel (kloon-ankers zouden niet matchen).

**Files:**
- Create: `extension/content/extractor.js`
- Test: `tests/extractor.test.js`
- Test-fixture: `tests/fixtures/article.html`

**Interfaces:**
- Consumes: `splitSentences` (Task 2).
- Produces: `extractArticle(doc, {maxSentences = 500}): {title: string|null, sentences: [{id: number, text: string}]}`
- Produces: `locateSentence(doc, sentenceText, {fromNode = null, fromOffset = 0}): [{node: Text, start: number, end: number}] | null` — `fromOffset` is de ruwe offset in `fromNode` vanaf waar gezocht wordt (nodig bij herhaalde zinnen in dezelfde tekstnode)

- [ ] **Step 1: Maak de fixture en schrijf de falende tests**

`tests/fixtures/article.html`:
```html
<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>Testartikel</title></head>
<body>
<nav><a href="#">Menu item een</a> <a href="#">Menu item twee</a></nav>
<article>
  <h1>Kat eet muis</h1>
  <p>De kat zat op de mat. Ze keek naar de muis.</p>
  <p>De muis rende <b>hard</b> weg. De kat bleef zitten.</p>
  <p>Herhaling komt voor. Herhaling komt voor.</p>
</article>
<footer>Copyright 2026. Alle rechten voorbehouden.</footer>
</body>
</html>
```

`tests/extractor.test.js`:
```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractArticle, locateSentence } from '../extension/content/extractor.js';

function loadFixture() {
  document.documentElement.innerHTML = readFileSync('tests/fixtures/article.html', 'utf8')
    .replace(/[\s\S]*<html[^>]*>/, '').replace(/<\/html>[\s\S]*/, '');
  return document;
}

describe('extractArticle', () => {
  beforeEach(() => loadFixture());

  it('extraheert zinnen uit het artikel, zonder nav en footer', () => {
    const { title, sentences } = extractArticle(document);
    const texts = sentences.map((s) => s.text);
    expect(texts).toContain('De kat zat op de mat.');
    expect(texts).toContain('De muis rende hard weg.');
    expect(texts.some((t) => t.includes('Menu item'))).toBe(false);
    expect(texts.some((t) => t.includes('Copyright'))).toBe(false);
    expect(title).toBeTruthy();
    // id's lopen op vanaf 0
    expect(sentences[0].id).toBe(0);
    expect(sentences[1].id).toBe(1);
  });

  it('valt terug op bodytekst als Readability niets vindt', () => {
    document.documentElement.innerHTML = '<head><title>leeg</title></head><body><p>Korte tekst.</p></body>';
    const { sentences } = extractArticle(document);
    // Readability kan hier null geven; in dat geval levert de fallback 'Korte tekst.'
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.some((s) => s.text.includes('Korte tekst.'))).toBe(true);
  });
});

describe('locateSentence', () => {
  beforeEach(() => loadFixture());

  it('vindt een zin in één tekstnode', () => {
    const segs = locateSentence(document, 'De kat zat op de mat.');
    expect(segs).not.toBeNull();
    const { node, start, end } = segs[0];
    expect(node.nodeValue.slice(start, end)).toBe('De kat zat op de mat.');
  });

  it('vindt een zin die over inline elementen heen loopt', () => {
    const segs = locateSentence(document, 'De muis rende hard weg.');
    expect(segs).not.toBeNull();
    expect(segs.length).toBeGreaterThanOrEqual(2); // tekst vóór en in <b>
    const joined = segs.map(({ node, start, end }) => node.nodeValue.slice(start, end)).join(' ');
    expect(joined).toBe('De muis rende hard weg.');
  });

  it('respecteert fromNode/fromOffset bij herhaalde zinnen', () => {
    const first = locateSentence(document, 'Herhaling komt voor.');
    const second = locateSentence(document, 'Herhaling komt voor.', {
      fromNode: first[0].node,
      fromOffset: first[0].end,
    });
    expect(second[0].start).toBeGreaterThan(first[0].start);
  });

  it('geeft null als de zin er niet is', () => {
    expect(locateSentence(document, 'Deze zin bestaat niet.')).toBeNull();
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/extractor.test.js`
Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/content/extractor.js`:
```js
// Artikelextractie: Readability op een documentkloon → zinnenlijst.
// locateSentence() zoekt een zin terug in het ORIGINELE document en geeft
// tekstsegmenten [{node, start, end}] terug voor de highlighter.
import { Readability } from '@mozilla/readability';
import { splitSentences } from './sentence-split.js';

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,caption';

export function extractArticle(doc, { maxSentences = 500 } = {}) {
  const clone = doc.cloneNode(true);
  const article = new Readability(clone).parse();

  const container = doc.createElement('div');
  let title = null;
  if (article?.content) {
    title = article.title || null;
    container.innerHTML = article.content;
  } else {
    // Fallback: platte bodytekst (Readability vond geen artikel).
    container.textContent = doc.body?.textContent || '';
  }

  const sentences = [];
  let id = 0;
  const pushText = (text) => {
    for (const s of splitSentences(text)) {
      sentences.push({ id: id++, text: s });
      if (sentences.length >= maxSentences) return true;
    }
    return false;
  };

  const blocks = [...container.querySelectorAll(BLOCK_SELECTOR)]
    .filter((el) => !el.querySelector(BLOCK_SELECTOR)); // alleen binnenste blokken
  if (blocks.length === 0) {
    pushText(container.textContent || '');
  } else {
    for (const el of blocks) {
      if (pushText(el.textContent || '')) break;
    }
  }
  return { title, sentences };
}

// Normaliseert whitespace en bouwt een map van genormaliseerde index → ruwe index.
function normalizeWithMap(raw) {
  let text = '';
  const map = [];
  let pendingSpaceAt = null;
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) {
      if (text.length && pendingSpaceAt === null) pendingSpaceAt = i;
      continue;
    }
    if (pendingSpaceAt !== null) { text += ' '; map.push(pendingSpaceAt); pendingSpaceAt = null; }
    text += raw[i];
    map.push(i);
  }
  return { text, map };
}

export function locateSentence(doc, sentenceText, { fromNode = null, fromOffset = 0 } = {}) {
  const target = String(sentenceText).replace(/\s+/g, ' ').trim();
  if (!target || !doc.body) return null;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  const startIdx = fromNode ? Math.max(0, nodes.indexOf(fromNode)) : 0;

  // Groeiende haystack van genormaliseerde node-teksten, gescheiden door één spatie.
  const items = []; // {node, norm, map, base, sliceAt}
  let hay = '';
  for (let i = startIdx; i < nodes.length; i++) {
    // Bij de fromNode beginnen we ná fromOffset (ruwe offset in die node),
    // zodat herhaalde zinnen in dezelfde tekstnode correct doorgeschakeld worden.
    const sliceAt = nodes[i] === fromNode ? fromOffset : 0;
    const { text, map } = normalizeWithMap(nodes[i].nodeValue.slice(sliceAt));
    if (!text) continue;
    items.push({ node: nodes[i], norm: text, map, sliceAt, base: hay ? hay.length + 1 : 0 });
    hay = hay ? `${hay} ${text}` : text;
    const hit = hay.indexOf(target);
    if (hit === -1) continue;
    const hitEnd = hit + target.length; // exclusief
    const segments = [];
    for (const item of items) {
      const s = Math.max(hit, item.base);
      const e = Math.min(hitEnd, item.base + item.norm.length);
      if (s < e) {
        segments.push({
          node: item.node,
          start: item.map[s - item.base] + item.sliceAt,
          end: item.map[e - 1 - item.base] + 1 + item.sliceAt,
        });
      }
    }
    return segments.length ? segments : null;
  }
  return null;
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/extractor.test.js`
Expected: 6 tests PASS. (Faalt de Readability-test op fixture-opmaak, pas dan de fixture aan — bijv. meer alinea's — tot Readability het artikel herkent.)

- [ ] **Step 5: Commit**

```bash
git add extension/content/extractor.js tests/extractor.test.js tests/fixtures/article.html
git commit -m "Artikelextractie met Readability en zinslokalisatie voor highlighting

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Highlighter (`content/highlighter.js`)

Zet highlight-spans om tekstsegmenten (zin-niveau) en om losse woorden daarbinnen (woord-niveau). `clear()` herstelt de originele DOM volledig. Woord-offsets worden opnieuw berekend na elke mutatie, dus callers hoeven geen rekening te houden met gesplitste text nodes.

**Files:**
- Create: `extension/content/highlighter.js`
- Test: `tests/highlighter.test.js`

**Interfaces:**
- Consumes: segmenten uit `locateSentence` (Task 6): `[{node: Text, start: number, end: number}]`.
- Produces: `HIGHLIGHT_CSS: string` — te injecteren door content.js.
- Produces: `createHighlighter(doc): {setSentence(segments): void, highlightWord(wordText, fromPos): number, clear(): void}`.
  - `highlightWord` zoekt `wordText` (eerst case-sensitief, dan ongevoelig) in de actieve zin vanaf `fromPos`, highlight het en geeft de positie ná het woord terug (nieuwe `fromPos` voor het volgende woord). Niet gevonden → geeft `fromPos` onveranderd terug.

- [ ] **Step 1: Schrijf de falende test**

`tests/highlighter.test.js`:
```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHighlighter, HIGHLIGHT_CSS } from '../extension/content/highlighter.js';
import { locateSentence } from '../extension/content/extractor.js';

beforeEach(() => {
  document.documentElement.innerHTML = readFileSync('tests/fixtures/article.html', 'utf8')
    .replace(/[\s\S]*<html[^>]*>/, '').replace(/<\/html>[\s\S]*/, '');
});

describe('createHighlighter', () => {
  it('highlight een zin en herstelt de DOM bij clear()', () => {
    const before = document.body.innerHTML;
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De kat zat op de mat.'));
    expect(document.querySelector('.tts-sentence').textContent).toBe('De kat zat op de mat.');
    h.clear();
    expect(document.body.innerHTML).toBe(before);
  });

  it('highlight opeenvolgende woorden binnen de zin', () => {
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De kat zat op de mat.'));
    let pos = h.highlightWord('kat', 0);
    expect(pos).toBeGreaterThan(0);
    expect(document.querySelector('.tts-word').textContent).toBe('kat');
    pos = h.highlightWord('mat', pos);
    expect(document.querySelectorAll('.tts-word')).toHaveLength(1); // vorige woord-highlight weg
    expect(document.querySelector('.tts-word').textContent).toBe('mat');
    expect(document.querySelector('.tts-sentence')).not.toBeNull(); // zin blijft staan
  });

  it('highlight een woord in een inline element', () => {
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De muis rende hard weg.'));
    h.highlightWord('hard', 0);
    expect(document.querySelector('.tts-word').textContent).toBe('hard');
  });

  it('geeft fromPos terug als het woord er niet is', () => {
    const h = createHighlighter(document);
    h.setSentence(locateSentence(document, 'De kat zat op de mat.'));
    expect(h.highlightWord('aardvarken', 4)).toBe(4);
  });

  it('bevat CSS voor beide highlight-niveaus', () => {
    expect(HIGHLIGHT_CSS).toContain('.tts-sentence');
    expect(HIGHLIGHT_CSS).toContain('.tts-word');
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/highlighter.test.js`
Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/content/highlighter.js`:
```js
// Highlighting via span-wrapping. Mutaties gebeuren in omgekeerde
// documentvolgorde zodat eerdere offsets geldig blijven.
const SENTENCE_CLS = 'tts-sentence';
const WORD_CLS = 'tts-word';

export const HIGHLIGHT_CSS = `
.${SENTENCE_CLS} { background: rgba(255, 213, 79, 0.35); border-radius: 3px; }
.${WORD_CLS} { background: #ffd54f; border-radius: 3px; }
`;

export function createHighlighter(doc) {
  let sentenceSpans = [];
  let wordSpans = [];

  function wrapRange(node, start, end, cls) {
    if (end <= start) return null;
    const middle = node.splitText(start);
    middle.splitText(end - start);
    const span = doc.createElement('span');
    span.className = cls;
    middle.parentNode.replaceChild(span, middle);
    span.appendChild(middle);
    return span;
  }

  function unwrap(spans) {
    for (const span of spans) {
      const parent = span.parentNode;
      if (!parent) continue;
      span.replaceWith(...span.childNodes);
      parent.normalize();
    }
  }

  // Alle tekstnodes binnen de actieve zin-spans, in documentvolgorde.
  function sentenceTextNodes() {
    const out = [];
    for (const span of sentenceSpans) {
      const walker = doc.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) out.push(n);
    }
    return out;
  }

  return {
    setSentence(segments) {
      this.clear();
      sentenceSpans = segments
        .map(({ node, start, end }) => wrapRange(node, start, end, SENTENCE_CLS))
        .filter(Boolean);
    },

    highlightWord(wordText, fromPos) {
      unwrap(wordSpans);
      wordSpans = [];
      const nodes = sentenceTextNodes();
      let joined = '';
      const bases = nodes.map((n) => { const b = joined.length; joined += n.nodeValue; return b; });
      let idx = joined.indexOf(wordText, fromPos);
      if (idx === -1) idx = joined.toLowerCase().indexOf(wordText.toLowerCase(), fromPos);
      if (idx === -1) return fromPos;
      const end = idx + wordText.length;

      // Achteraf wrappen: splitsen verandert offsets van latere nodes niet.
      for (let i = nodes.length - 1; i >= 0; i--) {
        const s = Math.max(idx, bases[i]);
        const e = Math.min(end, bases[i] + nodes[i].nodeValue.length);
        if (s < e) {
          const span = wrapRange(nodes[i], s - bases[i], e - bases[i], WORD_CLS);
          if (span) wordSpans.unshift(span);
        }
      }
      return end;
    },

    clear() {
      unwrap(wordSpans);
      wordSpans = [];
      unwrap(sentenceSpans);
      sentenceSpans = [];
    },
  };
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/highlighter.test.js`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/content/highlighter.js tests/highlighter.test.js
git commit -m "Highlighter: zin- en woord-spans met volledig DOM-herstel

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```


---

### Task 8: Instellingen-wrapper (`shared/settings.js`)

**Files:**
- Create: `extension/shared/settings.js`
- Test: `tests/settings.test.js`

**Interfaces:**
- Produces: `DEFAULTS = {rate: 1, enginePref: 'cloud', voiceOverrides: {}}`
- Produces: `createSettings(storage): {load(): Promise<object>, get(key), set(patch): Promise<object>}` — `storage` is `browser.storage.local` of een fake met `get(defaults)`/`set(obj)`.

- [ ] **Step 1: Schrijf de falende test**

`tests/settings.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createSettings, DEFAULTS } from '../extension/shared/settings.js';

function fakeStorage(initial = {}) {
  return {
    _d: { ...initial },
    async get(defaults) { return { ...defaults, ...this._d }; },
    async set(obj) { Object.assign(this._d, obj); },
  };
}

describe('createSettings', () => {
  it('levert defaults bij lege storage', async () => {
    const s = createSettings(fakeStorage());
    await s.load();
    expect(s.get('rate')).toBe(1);
    expect(s.get('enginePref')).toBe('cloud');
  });
  it('leest opgeslagen waarden over defaults heen', async () => {
    const s = createSettings(fakeStorage({ rate: 1.5 }));
    await s.load();
    expect(s.get('rate')).toBe(1.5);
    expect(s.get('enginePref')).toBe('cloud'); // default blijft
  });
  it('set() werkt cache en storage bij', async () => {
    const storage = fakeStorage();
    const s = createSettings(storage);
    await s.load();
    await s.set({ voiceOverrides: { nl: 'nl-NL-MaartenNeural' } });
    expect(s.get('voiceOverrides')).toEqual({ nl: 'nl-NL-MaartenNeural' });
    expect(storage._d.voiceOverrides).toEqual({ nl: 'nl-NL-MaartenNeural' });
  });
  it('load() vult ontbrekende sleutels met DEFAULTS', async () => {
    const s = createSettings(fakeStorage({ rate: 2 }));
    const loaded = await s.load();
    expect(loaded).toEqual({ ...DEFAULTS, rate: 2 });
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/settings.test.js`
Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/shared/settings.js`:
```js
// Dunne wrapper om browser.storage.local met defaults en een in-memory cache.
export const DEFAULTS = {
  rate: 1,
  enginePref: 'cloud', // fase 2: 'local-first' | 'local-only'
  voiceOverrides: {},  // {nl: 'nl-NL-MaartenNeural', ...}
};

export function createSettings(storage) {
  let cache = { ...DEFAULTS };
  return {
    async load() {
      const stored = await storage.get(DEFAULTS);
      cache = { ...DEFAULTS, ...stored };
      return cache;
    },
    get(key) {
      return cache[key];
    },
    async set(patch) {
      cache = { ...cache, ...patch };
      await storage.set(patch);
      return cache;
    },
  };
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/settings.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/shared/settings.js tests/settings.test.js
git commit -m "Instellingen-wrapper met defaults en storage-cache

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Player-statemachine (`background/player.js`)

Het hart van de background: speelt een zinnenlijst af via de engine en een audio-adapter, met prefetch van de volgende zin en een progress-ticker. Puur logica met geïnjecteerde afhankelijkheden.

**Files:**
- Create: `extension/background/player.js`
- Test: `tests/player.test.js`

**Interfaces:**
- Consumes: engine-interface uit Task 5 (`synthesize({text, voice, rate})`).
- Produces: `createPlayer({engine, audio, onEvent, setIntervalImpl?, clearIntervalImpl?, progressMs?})`.
  - Methoden: `start({sentences, voice, rate})`, `pause()`, `resume()`, `stop()`, `seek(i)`, `setRate(r)`, `currentIndex()`.
  - `audio`-adapter: `play(blob): Promise<void>` (resolveert bij einde van het fragment), `pause()`, `resume()`, `stop()`, `currentTimeMs(): number`.
  - Events via `onEvent`: `{type:'sentence-start', index, boundaries}`, `{type:'sentence-end', index}`, `{type:'progress', index, elapsedMs}`, `{type:'end'}`, `{type:'error', message}`, `{type:'state', state}` met state ∈ `idle|loading|playing|paused`.
  - `setRate` geldt vanaf de volgende zin (gedocumenteerd MVP-gedrag; de cache voor toekomstige zinnen wordt verwijderd).

- [ ] **Step 1: Schrijf de falende test**

`tests/player.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createPlayer } from '../extension/background/player.js';

const SENTENCES = [{ id: 0, text: 'Een.' }, { id: 1, text: 'Twee.' }, { id: 2, text: 'Drie.' }];
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeEngine() {
  const calls = [];
  return {
    calls,
    synthesize({ text, voice, rate }) {
      calls.push({ text, voice, rate });
      return Promise.resolve({ audio: `blob:${text}`, boundaries: [{ text, offsetMs: 0, durationMs: 100 }] });
    },
  };
}

function fakeAudio() {
  let finishCurrent = null;
  return {
    played: [], pauseCount: 0, resumeCount: 0, stopCount: 0, timeMs: 0,
    play(blob) { this.played.push(blob); return new Promise((r) => { finishCurrent = r; }); },
    pause() { this.pauseCount++; },
    resume() { this.resumeCount++; },
    stop() { this.stopCount++; if (finishCurrent) { const f = finishCurrent; finishCurrent = null; f(); } },
    currentTimeMs() { return this.timeMs; },
    finish() { if (finishCurrent) { const f = finishCurrent; finishCurrent = null; f(); } },
  };
}

function fakeScheduler() {
  const cbs = new Map();
  let next = 1;
  return {
    setInterval: (cb, ms) => { const id = next++; cbs.set(id, cb); return id; },
    clearInterval: (id) => cbs.delete(id),
    tick: () => { for (const cb of [...cbs.values()]) cb(); },
    active: () => cbs.size,
  };
}

function setup() {
  const engine = fakeEngine();
  const audio = fakeAudio();
  const sched = fakeScheduler();
  const events = [];
  const player = createPlayer({
    engine, audio, onEvent: (e) => events.push(e),
    setIntervalImpl: sched.setInterval, clearIntervalImpl: sched.clearInterval,
  });
  return { engine, audio, sched, events, player };
}

describe('createPlayer', () => {
  it('speelt alle zinnen achter elkaar af en eindigt met end', async () => {
    const { engine, audio, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'nl-NL-FennaNeural', rate: 1 });
    await flush();
    expect(events[0]).toMatchObject({ type: 'sentence-start', index: 0 });
    expect(engine.calls).toHaveLength(2); // zin 0 + prefetch zin 1
    audio.finish(); await flush();
    expect(events).toContainEqual({ type: 'sentence-end', index: 0 });
    audio.finish(); await flush();
    audio.finish(); await flush();
    expect(events.at(-1)).toEqual({ type: 'end' });
    expect(player.currentIndex()).toBe(2);
  });

  it('pauzeert en hervat', async () => {
    const { audio, sched, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.pause();
    expect(audio.pauseCount).toBe(1);
    expect(events).toContainEqual({ type: 'state', state: 'paused' });
    expect(sched.active()).toBe(0); // ticker stopt
    player.resume();
    expect(audio.resumeCount).toBe(1);
    expect(sched.active()).toBe(1); // ticker loopt weer
  });

  it('stuurt progress-events met elapsedMs uit de audio-adapter', async () => {
    const { audio, sched, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    audio.timeMs = 1234;
    sched.tick();
    expect(events).toContainEqual({ type: 'progress', index: 0, elapsedMs: 1234 });
  });

  it('seek() springt naar een andere zin en stopt de huidige', async () => {
    const { audio, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.seek(2);
    await flush();
    expect(audio.stopCount).toBe(1);
    expect(events).toContainEqual({ type: 'sentence-start', index: 2 });
    expect(player.currentIndex()).toBe(2);
  });

  it('stop() ruimt alles op', async () => {
    const { audio, sched, events, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.stop();
    await flush();
    expect(audio.stopCount).toBe(1);
    expect(sched.active()).toBe(0);
    expect(events).toContainEqual({ type: 'state', state: 'idle' });
    expect(events.at(-1)).toEqual({ type: 'state', state: 'idle' }); // geen 'end' na stop
  });

  it('setRate() geldt vanaf de volgende synthese', async () => {
    const { engine, audio, player } = setup();
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    player.setRate(1.5);
    audio.finish(); await flush();
    expect(engine.calls.at(-1).rate).toBe(1.5);
  });

  it('stuurt error-event als de engine faalt', async () => {
    const engine = { synthesize: () => Promise.reject(new Error('netwerk stuk')) };
    const audio = fakeAudio();
    const sched = fakeScheduler();
    const events = [];
    const player = createPlayer({
      engine, audio, onEvent: (e) => events.push(e),
      setIntervalImpl: sched.setInterval, clearIntervalImpl: sched.clearInterval,
    });
    player.start({ sentences: SENTENCES, voice: 'v', rate: 1 });
    await flush();
    expect(events).toContainEqual({ type: 'error', message: 'netwerk stuk' });
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/player.test.js`
Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/background/player.js`:
```js
// Player-statemachine: speelt zinnen af via engine + audio-adapter.
// `generation` beschermt tegen race-conditions na seek/stop: verlate
// synthese- of afspaelresultaten van een oude generatie worden genegeerd.
export function createPlayer({
  engine, audio, onEvent,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, progressMs = 100,
}) {
  let sentences = [];
  let voice = null;
  let rate = 1;
  let idx = -1;
  let state = 'idle'; // idle | loading | playing | paused
  let generation = 0;
  let ticker = null;
  const cache = new Map(); // index → Promise<{audio, boundaries}>

  const emit = (e) => onEvent?.(e);
  const setState = (s) => { state = s; emit({ type: 'state', state: s }); };

  function startTicker(gen) {
    stopTicker();
    ticker = setIntervalImpl(() => {
      if (gen === generation) emit({ type: 'progress', index: idx, elapsedMs: audio.currentTimeMs() });
    }, progressMs);
  }
  function stopTicker() {
    if (ticker !== null) { clearIntervalImpl(ticker); ticker = null; }
  }

  function prefetch(i) {
    if (i < 0 || i >= sentences.length || cache.has(i)) return;
    cache.set(i, engine.synthesize({ text: sentences[i].text, voice, rate }));
  }

  async function playIndex(i) {
    const gen = generation;
    idx = i;
    setState('loading');
    if (!cache.has(i)) prefetch(i);
    prefetch(i + 1);
    try {
      const { audio: blob, boundaries } = await cache.get(i);
      if (gen !== generation) return;
      cache.delete(i);
      setState('playing');
      emit({ type: 'sentence-start', index: i, boundaries });
      startTicker(gen);
      await audio.play(blob);
      if (gen !== generation) return;
      stopTicker();
      emit({ type: 'sentence-end', index: i });
      if (i + 1 < sentences.length) {
        playIndex(i + 1);
      } else {
        setState('idle');
        emit({ type: 'end' });
      }
    } catch (err) {
      if (gen !== generation) return;
      stopTicker();
      setState('idle');
      emit({ type: 'error', message: String(err?.message || err) });
    }
  }

  return {
    start({ sentences: s, voice: v, rate: r }) {
      generation++;
      stopTicker();
      audio.stop();
      cache.clear();
      sentences = s;
      voice = v;
      rate = r ?? 1;
      playIndex(0);
    },
    pause() {
      if (state !== 'playing') return;
      audio.pause();
      stopTicker();
      setState('paused');
    },
    resume() {
      if (state !== 'paused') return;
      audio.resume();
      setState('playing');
      startTicker(generation);
    },
    stop() {
      if (state === 'idle' && idx === -1) return;
      generation++;
      stopTicker();
      audio.stop();
      cache.clear();
      idx = -1;
      setState('idle');
    },
    seek(i) {
      if (!sentences.length) return;
      const target = Math.min(Math.max(0, i), sentences.length - 1);
      generation++;
      stopTicker();
      audio.stop();
      cache.clear();
      playIndex(target);
    },
    setRate(r) {
      rate = r;
      cache.clear(); // toekomstige zinnen worden opnieuw gesynthetiseerd
      if (idx >= 0) prefetch(idx + 1);
    },
    currentIndex() { return idx; },
  };
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/player.test.js`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/background/player.js tests/player.test.js
git commit -m "Player-statemachine met prefetch, progress-ticker en seek

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```


---

### Task 10: Audio-adapter + background-entry

`audio-player.js` is bewust dun (directe browser-API's, handmatig getest in Task 15). `background.js` routeert berichten en koppelt alles aan elkaar.

**Files:**
- Create: `extension/background/audio-player.js`
- Modify: `extension/background/background.js` (vervangt hello-world uit Task 1)

**Interfaces:**
- Consumes: `createPlayer` (Task 9), `createEdgeEngine` (Task 5), `createSettings` (Task 8), `resolveVoice` (Task 3), `MSG`/`CONTROL` (Task 1).
- Produces: `createAudioPlayer(): <audio-adapter voor createPlayer>`.
- Background berichtencontract: ontvangt `MSG.START` `{sentences, lang}` en `MSG.CONTROL` `{action, value?}`; stuurt `MSG.TOGGLE` naar de actieve tab en `MSG.EVENT` `{event}` terug naar de tab die gestart heeft.

- [ ] **Step 1: Implementeer audio-player.js (geen unit test — dunne browser-adapter)**

`extension/background/audio-player.js`:
```js
// Speelt audio-blobs af in de background page (geen autoplay-beperking).
// play() resolveert bij einde van het fragment én bij stop().
export function createAudioPlayer() {
  let el = null;
  let url = null;
  let finish = null;

  function cleanup() {
    if (url) URL.revokeObjectURL(url);
    url = null;
  }

  return {
    play(blob) {
      this.stop();
      url = URL.createObjectURL(blob);
      el = new Audio(url);
      return new Promise((resolve) => {
        finish = resolve;
        el.onended = () => { cleanup(); resolve(); };
        el.onerror = () => { cleanup(); resolve(); };
        el.play().catch(() => { cleanup(); resolve(); });
      });
    },
    pause() { el?.pause(); },
    resume() { el?.play().catch(() => {}); },
    stop() {
      if (el) { el.pause(); el.removeAttribute('src'); }
      cleanup();
      if (finish) { const f = finish; finish = null; f(); }
    },
    currentTimeMs() { return el ? el.currentTime * 1000 : 0; },
  };
}
```

- [ ] **Step 2: Implementeer background.js**

`extension/background/background.js`:
```js
// Berichtenrouter: koppelt content scripts aan de player.
import { MSG, CONTROL } from '../shared/messages.js';
import { createSettings } from '../shared/settings.js';
import { resolveVoice } from '../shared/voices.js';
import { createEdgeEngine } from './engines/edge-tts.js';
import { createAudioPlayer } from './audio-player.js';
import { createPlayer } from './player.js';

const settings = createSettings(browser.storage.local);
const engine = createEdgeEngine();
let player = null;
let activeTabId = null;

function ensurePlayer() {
  if (player) return player;
  player = createPlayer({
    engine,
    audio: createAudioPlayer(),
    onEvent: (event) => {
      if (activeTabId == null) return;
      browser.tabs.sendMessage(activeTabId, { type: MSG.EVENT, event }).catch(() => {});
    },
  });
  return player;
}

// Werkbalkknop of Alt+R: content script beslist (start of stop).
async function toggle(tab) {
  try {
    await browser.tabs.sendMessage(tab.id, { type: MSG.TOGGLE });
  } catch {
    // Pagina zonder content script (about:*, addons.mozilla.org) — negeren.
  }
}

browser.browserAction.onClicked.addListener(toggle);
browser.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-read') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) await toggle(tab);
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === MSG.START && sender.tab) {
    activeTabId = sender.tab.id;
    (async () => {
      const s = await settings.load();
      ensurePlayer().start({
        sentences: msg.sentences,
        voice: resolveVoice(msg.lang, s.voiceOverrides),
        rate: s.rate,
      });
    })();
    return false;
  }
  if (msg.type === MSG.CONTROL && player) {
    const { action, value } = msg;
    if (action === CONTROL.PAUSE) player.pause();
    else if (action === CONTROL.RESUME) player.resume();
    else if (action === CONTROL.NEXT) player.seek(player.currentIndex() + 1);
    else if (action === CONTROL.PREV) player.seek(player.currentIndex() - 1);
    else if (action === CONTROL.SEEK) player.seek(value);
    else if (action === CONTROL.STOP) player.stop();
    else if (action === CONTROL.RATE) player.setRate(value);
    return false;
  }
  return false;
});
```

- [ ] **Step 3: Verifieer**

Run: `npm test` → alle eerdere tests PASS. Run: `npm run build` → Build OK. Run: `npm run lint` → geen errors.

- [ ] **Step 4: Commit**

```bash
git add extension/background/audio-player.js extension/background/background.js
git commit -m "Background-entry: audio-adapter en berichtenrouter met player

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: Playerbar (`content/playerbar.js`)

Bedieningsbalk onderin de pagina in een **closed shadow DOM**, zodat pagina-CSS de balk niet beïnvloedt en vice versa.

**Files:**
- Create: `extension/content/playerbar.js`
- Test: `tests/playerbar.test.js`

**Interfaces:**
- Produces: `createPlayerBar(doc, {onControl}): {el, setPlaying(bool), destroy()}`. `onControl(action, value?)` met actions uit `CONTROL` (Task 1). Knoppen: prev, pause/resume (toggle), next, stop; select: rate (0.5–2).

- [ ] **Step 1: Schrijf de falende test**

`tests/playerbar.test.js`:
```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createPlayerBar } from '../extension/content/playerbar.js';
import { CONTROL } from '../extension/shared/messages.js';

function makeBar() {
  const calls = [];
  const bar = createPlayerBar(document, { onControl: (a, v) => calls.push([a, v]) });
  document.body.appendChild(bar.el);
  return { calls, bar };
}
// Closed shadow DOM: test via events op de host en publieke API.
function clickButton(bar, action) {
  bar.el.shadowRoot?.querySelector(`[data-a="${action}"]`)?.dispatchEvent(new Event('click', { bubbles: true }));
}

describe('createPlayerBar', () => {
  it('stuurt pause en daarna resume bij klik op de pause-knop', () => {
    const { calls, bar } = makeBar();
    clickButton(bar, 'pause');
    expect(calls).toContainEqual([CONTROL.PAUSE, undefined]);
    bar.setPlaying(false);
    clickButton(bar, 'pause');
    expect(calls).toContainEqual([CONTROL.RESUME, undefined]);
  });

  it('stuurt next/prev/stop', () => {
    const { calls, bar } = makeBar();
    clickButton(bar, 'next');
    clickButton(bar, 'prev');
    clickButton(bar, 'stop');
    expect(calls.map(([a]) => a)).toEqual([CONTROL.NEXT, CONTROL.PREV, CONTROL.STOP]);
  });

  it('stuurt rate bij wijzigen van de select', () => {
    const { calls, bar } = makeBar();
    const select = bar.el.shadowRoot?.querySelector('select[data-a="rate"]');
    if (select) {
      select.value = '1.5';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(calls).toContainEqual([CONTROL.RATE, 1.5]);
    } else {
      throw new Error('rate-select niet gevonden in shadow DOM');
    }
  });

  it('destroy() verwijdert de balk uit het document', () => {
    const { bar } = makeBar();
    bar.destroy();
    expect(document.body.contains(bar.el)).toBe(false);
  });
});
```

Let op: jsdom ondersteunt `attachShadow({mode:'closed'})`, maar `el.shadowRoot` is dan `null` — dat is juist de bedoeling in productie. Voor testbaarheid exposeert `createPlayerBar` daarom **intern** een `_shadow` eigenschap op het resultaat (niet gedocumenteerd als publieke API). Pas de helperfuncties hierboven aan om `bar._shadow` te gebruiken i.p.v. `bar.el.shadowRoot`.

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/playerbar.test.js`
Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/content/playerbar.js`:
```js
// Bedieningsbalk in een closed shadow DOM, zodat pagina-CSS niet meekijkt.
import { CONTROL } from '../shared/messages.js';

const BAR_CSS = `
  .bar {
    position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; align-items: center;
    background: #263238; color: #fff; border-radius: 24px; padding: 8px 14px;
    box-shadow: 0 2px 12px rgba(0,0,0,.4); z-index: 2147483647;
    font: 14px/1 system-ui, sans-serif;
  }
  button {
    background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;
    padding: 4px 8px; border-radius: 50%;
  }
  button:hover { background: rgba(255,255,255,.15); }
  select { background: #37474f; color: #fff; border: none; border-radius: 4px; padding: 4px; }
  .engine { font-size: 16px; margin-left: 4px; }
`;

export function createPlayerBar(doc, { onControl }) {
  const host = doc.createElement('div');
  host.id = 'tts-lnx-playerbar';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>${BAR_CSS}</style>
    <div class="bar" role="toolbar" aria-label="Voorleesbediening">
      <button data-a="prev" aria-label="Vorige zin" title="Vorige zin">⏮</button>
      <button data-a="pause" aria-label="Pauzeren" title="Pauzeren">⏸</button>
      <button data-a="next" aria-label="Volgende zin" title="Volgende zin">⏭</button>
      <button data-a="stop" aria-label="Stoppen" title="Stoppen">⏹</button>
      <select data-a="rate" aria-label="Snelheid">
        <option value="0.5">0,5×</option>
        <option value="0.75">0,75×</option>
        <option value="1" selected>1×</option>
        <option value="1.25">1,25×</option>
        <option value="1.5">1,5×</option>
        <option value="2">2×</option>
      </select>
      <span class="engine" title="Engine: cloud (Edge TTS)">☁</span>
    </div>`;

  let playing = true;
  const pauseBtn = shadow.querySelector('[data-a="pause"]');

  shadow.querySelector('[data-a="prev"]').addEventListener('click', () => onControl(CONTROL.PREV));
  shadow.querySelector('[data-a="next"]').addEventListener('click', () => onControl(CONTROL.NEXT));
  shadow.querySelector('[data-a="stop"]').addEventListener('click', () => onControl(CONTROL.STOP));
  pauseBtn.addEventListener('click', () => {
    onControl(playing ? CONTROL.PAUSE : CONTROL.RESUME);
  });
  shadow.querySelector('[data-a="rate"]').addEventListener('change', (e) => {
    onControl(CONTROL.RATE, parseFloat(e.target.value));
  });

  return {
    el: host,
    _shadow: shadow, // alleen voor tests; closed shadow is verder afgeschermd
    setPlaying(isPlaying) {
      playing = isPlaying;
      pauseBtn.textContent = isPlaying ? '⏸' : '▶';
      pauseBtn.setAttribute('aria-label', isPlaying ? 'Pauzeren' : 'Hervatten');
    },
    destroy() { host.remove(); },
  };
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/playerbar.test.js`
Expected: 4 tests PASS (pas zoals aangegeven in Step 1 de helpers aan naar `bar._shadow`)

- [ ] **Step 5: Commit**

```bash
git add extension/content/playerbar.js tests/playerbar.test.js
git commit -m "Playerbar in closed shadow DOM met bediening en snelheidskeuze

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Instellingenpagina (`options/options.html` + `options/options.js`)

**Files:**
- Modify: `extension/options/options.html` (vervangt placeholder uit Task 1)
- Modify: `extension/options/options.js`
- Test: `tests/options.test.js`

**Interfaces:**
- Consumes: `createSettings` (Task 8), `VOICES` (Task 3).

- [ ] **Step 1: Schrijf de falende test**

`tests/options.test.js`:
```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { initOptions } from '../extension/options/options.js';
import { VOICES } from '../extension/shared/voices.js';

function fakeStorage(initial = {}) {
  return {
    _d: { ...initial },
    async get(defaults) { return { ...defaults, ...this._d }; },
    async set(obj) { Object.assign(this._d, obj); },
  };
}

beforeEach(() => {
  // De rate-select heeft zijn opties nodig; anders heeft .value zetten geen effect.
  document.body.innerHTML = `
    <select id="rate">
      <option value="0.5">0,5×</option>
      <option value="0.75">0,75×</option>
      <option value="1">1×</option>
      <option value="1.25">1,25×</option>
      <option value="1.5">1,5×</option>
      <option value="2">2×</option>
    </select>
    <div id="voices"></div>
    <input type="radio" name="pref" value="cloud">
    <p id="saved" hidden>Opgeslagen ✓</p>`;
});

describe('initOptions', () => {
  it('vult stem-selects per taal en laadt opgeslagen waarden', async () => {
    const storage = fakeStorage({ rate: 1.5, voiceOverrides: { nl: 'nl-NL-MaartenNeural' } });
    await initOptions(document, storage);
    expect(document.getElementById('rate').value).toBe('1.5');
    const nlSelect = document.querySelector('select[data-lang="nl"]');
    expect(nlSelect.value).toBe('nl-NL-MaartenNeural');
    expect(Object.keys(VOICES).every((l) => document.querySelector(`select[data-lang="${l}"]`))).toBe(true);
  });

  it('slaat wijzigingen direct op', async () => {
    const storage = fakeStorage();
    await initOptions(document, storage);
    const rate = document.getElementById('rate');
    rate.value = '2';
    rate.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(storage._d.rate).toBe(2);
    expect(document.getElementById('saved').hidden).toBe(false);
  });
});
```

- [ ] **Step 2: Draai de test — moet FALEN**

Run: `npx vitest run tests/options.test.js`
Expected: FAIL (`initOptions` ontbreekt)

- [ ] **Step 3: Implementatie**

`extension/options/options.html`:
```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>TTS-instellingen</title>
  <style>
    body { font: 14px system-ui, sans-serif; max-width: 36em; margin: 2em auto; }
    label { display: block; margin: .8em 0; }
    fieldset { margin: 1em 0; border-radius: 6px; }
    #saved { color: #2e7d32; }
  </style>
</head>
<body>
  <h1>Voorlees-instellingen</h1>
  <label>Standaardsnelheid
    <select id="rate">
      <option value="0.5">0,5×</option>
      <option value="0.75">0,75×</option>
      <option value="1">1×</option>
      <option value="1.25">1,25×</option>
      <option value="1.5">1,5×</option>
      <option value="2">2×</option>
    </select>
  </label>
  <fieldset>
    <legend>Stem per taal</legend>
    <div id="voices"></div>
  </fieldset>
  <fieldset>
    <legend>Engine-voorkeur</legend>
    <label><input type="radio" name="pref" value="cloud" checked> Cloud eerst (Edge TTS)</label>
    <label title="Beschikbaar vanaf fase 2"><input type="radio" name="pref" value="local" disabled> Alleen lokaal (Piper — fase 2)</label>
  </fieldset>
  <p id="saved" hidden>Opgeslagen ✓</p>
  <script src="options.js"></script>
</body>
</html>
```

`extension/options/options.js`:
```js
// Instellingenpagina: vult selects vanuit VOICES en slaat direct op.
import { createSettings } from '../shared/settings.js';
import { VOICES } from '../shared/voices.js';

const LANG_LABELS = { nl: 'Nederlands', en: 'Engels', de: 'Duits', fr: 'Frans', es: 'Spaans' };

export async function initOptions(doc, storage) {
  const settings = createSettings(storage);
  const s = await settings.load();

  const saved = doc.getElementById('saved');
  const showSaved = () => { saved.hidden = false; setTimeout(() => { saved.hidden = true; }, 1500); };

  const rate = doc.getElementById('rate');
  rate.value = String(s.rate);
  rate.addEventListener('change', async () => {
    await settings.set({ rate: parseFloat(rate.value) });
    showSaved();
  });

  const voicesDiv = doc.getElementById('voices');
  for (const [lang, voices] of Object.entries(VOICES)) {
    const label = doc.createElement('label');
    label.textContent = `${LANG_LABELS[lang] ?? lang} `;
    const select = doc.createElement('select');
    select.dataset.lang = lang;
    for (const v of voices) {
      const opt = doc.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    select.value = s.voiceOverrides[lang] ?? voices[0];
    select.addEventListener('change', async () => {
      const cur = settings.get('voiceOverrides') ?? {};
      await settings.set({ voiceOverrides: { ...cur, [lang]: select.value } });
      showSaved();
    });
    label.appendChild(select);
    voicesDiv.appendChild(label);
  }

  const pref = s.enginePref ?? 'cloud';
  const radio = doc.querySelector(`input[name="pref"][value="${pref}"]`);
  if (radio && !radio.disabled) radio.checked = true;
  for (const r of doc.querySelectorAll('input[name="pref"]')) {
    r.addEventListener('change', async () => {
      await settings.set({ enginePref: r.value });
      showSaved();
    });
  }
}

// In de browser draait dit direct; in tests roepen we initOptions zelf aan.
if (typeof browser !== 'undefined' && typeof document !== 'undefined' && document.getElementById('voices')) {
  initOptions(document, browser.storage.local);
}
```

- [ ] **Step 4: Draai de test — moet PASSEN**

Run: `npx vitest run tests/options.test.js`
Expected: 2 tests PASS. Daarna `npm run build` → Build OK.

- [ ] **Step 5: Commit**

```bash
git add extension/options/options.html extension/options/options.js tests/options.test.js
git commit -m "Instellingenpagina: snelheid, stem per taal, engine-voorkeur

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```


---

### Task 13: Content-wiring (`content/content.js`) + Alt+R-sneltoets

Verbindt alles in de pagina: extractie → START, playerevents → highlighting + meescrollen, klik-op-alinea → seek, stop → opruimen. Vervangt de hello-world uit Task 1.

**Files:**
- Modify: `extension/content/content.js` (vervangt hello-world)
- Modify: `extension/manifest.json` (voegt `commands` toe)
- Modify: `extension/content/playerbar.js` (voegt `setRate(r)` toe — zie Step 1)

**Interfaces:**
- Consumes: `extractArticle`, `locateSentence` (Task 6); `createHighlighter`, `HIGHLIGHT_CSS` (Task 7); `createPlayerBar` (Task 11); `detectLanguage` (Task 3); `MSG`, `CONTROL` (Task 1).
- Produces: geen nieuwe module-interfaces; dit is de applicatie-entry.
- Achtergrond stuurt vóór de eerste player-event een `{type:'init', rate}`-event zodat de playerbar de ingestelde snelheid toont — **daarom background.js aanpassen**: in de `MSG.START`-handler, direct na `settings.load()`, `browser.tabs.sendMessage(sender.tab.id, {type: MSG.EVENT, event: {type: 'init', rate: s.rate}})` sturen vóór `ensurePlayer().start(...)`.

- [ ] **Step 1: Breid playerbar uit met setRate**

Voeg in `extension/content/playerbar.js` aan het geretourneerde object toe (en een test in `tests/playerbar.test.js`):

```js
    setRate(r) {
      const select = shadow.querySelector('[data-a="rate"]');
      select.value = String(r);
    },
```

Test (toevoegen aan `tests/playerbar.test.js`):
```js
  it('setRate() zet de select-waarde', () => {
    const { bar } = makeBar();
    bar.setRate(1.5);
    expect(bar._shadow.querySelector('select[data-a="rate"]').value).toBe('1.5');
  });
```

Run: `npx vitest run tests/playerbar.test.js` → PASS.

- [ ] **Step 2: Implementeer content.js**

`extension/content/content.js`:
```js
// Applicatie-entry in de pagina: extractie, highlighting, playerbar, seek.
import { MSG, CONTROL } from '../shared/messages.js';
import { extractArticle, locateSentence } from './extractor.js';
import { detectLanguage } from './language-detect.js';
import { createHighlighter, HIGHLIGHT_CSS } from './highlighter.js';
import { createPlayerBar } from './playerbar.js';

let active = false;
let sentences = [];
let highlighter = null;
let bar = null;
let styleEl = null;
let lastPos = { node: null, end: 0 }; // zoekpointer: laatste gelokaliseerde positie
let currentBoundaries = [];
let wordPos = 0;
let lastWordIndex = -1;

function send(msg) { browser.runtime.sendMessage(msg).catch(() => {}); }

function showNotice(text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);'
    + 'background:#b71c1c;color:#fff;padding:8px 16px;border-radius:6px;'
    + 'z-index:2147483647;font:14px system-ui,sans-serif';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function cleanup() {
  highlighter?.clear();
  highlighter = null;
  bar?.destroy();
  bar = null;
  styleEl?.remove();
  styleEl = null;
  sentences = [];
  lastPos = { node: null, end: 0 };
  currentBoundaries = [];
  wordPos = 0;
  lastWordIndex = -1;
  active = false;
}

function startReading() {
  const { sentences: found } = extractArticle(document);
  if (!found.length) {
    showNotice('Geen voorleesbare tekst gevonden op deze pagina.');
    return;
  }
  sentences = found;
  const sample = found.slice(0, 10).map((s) => s.text).join(' ');
  const lang = document.documentElement.lang?.slice(0, 2).toLowerCase()
    || detectLanguage(sample) || null;

  styleEl = document.createElement('style');
  styleEl.textContent = HIGHLIGHT_CSS;
  document.head.appendChild(styleEl);

  highlighter = createHighlighter(document);
  bar = createPlayerBar(document, {
    onControl: (action, value) => {
      send({ type: MSG.CONTROL, action, value });
      if (action === CONTROL.STOP) cleanup();
    },
  });
  document.body.appendChild(bar.el);
  active = true;
  send({ type: MSG.START, sentences, lang });
}

function onSentenceStart(event) {
  currentBoundaries = event.boundaries ?? [];
  wordPos = 0;
  lastWordIndex = -1;
  highlighter?.clear();
  const sentence = sentences[event.index];
  if (!sentence) return;
  const segs = locateSentence(document, sentence.text, { fromNode: lastPos.node, fromOffset: lastPos.end });
  if (!segs) return; // anker niet gevonden: doorspelen zonder highlight
  highlighter.setSentence(segs);
  lastPos = { node: segs[segs.length - 1].node, end: segs[segs.length - 1].end };
  segs[0].node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function onProgress(event) {
  if (!currentBoundaries.length || !highlighter) return;
  let wi = lastWordIndex;
  for (let i = 0; i < currentBoundaries.length; i++) {
    if (currentBoundaries[i].offsetMs <= event.elapsedMs) wi = i;
  }
  if (wi > lastWordIndex) {
    lastWordIndex = wi;
    wordPos = highlighter.highlightWord(currentBoundaries[wi].text, wordPos);
  }
}

function onEvent(event) {
  if (!active && event.type !== 'init') return;
  switch (event.type) {
    case 'init': bar?.setRate(event.rate); break;
    case 'sentence-start': onSentenceStart(event); break;
    case 'progress': onProgress(event); break;
    case 'state': bar?.setPlaying(event.state === 'playing'); break;
    case 'end': cleanup(); break;
    case 'error': showNotice(`Voorlezen mislukt: ${event.message}`); cleanup(); break;
  }
}

// Klik op een alinea = start vanaf de eerste zin van dat blok.
// Links/knoppen/formuliervelden worden met rust gelaten.
document.addEventListener('click', (ev) => {
  if (!active || !sentences.length) return;
  if (ev.target.closest('a,button,input,select,textarea,#tts-lnx-playerbar')) return;
  const block = ev.target.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,figcaption');
  if (!block) return;
  const blockText = (block.textContent || '').replace(/\s+/g, ' ');
  const hit = sentences.find((s) => blockText.includes(s.text));
  if (hit) send({ type: MSG.CONTROL, action: CONTROL.SEEK, value: hit.id });
}, true);

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.TOGGLE) {
    if (active) { send({ type: MSG.CONTROL, action: CONTROL.STOP }); cleanup(); }
    else startReading();
    return false;
  }
  if (msg.type === MSG.EVENT) {
    onEvent(msg.event);
    return false;
  }
  return false;
});
```

Gebruikte modules: alle imports hierboven worden gebruikt; voeg geen ongebruikte imports toe.

- [ ] **Step 3: Voeg de sneltoets toe aan het manifest**

In `extension/manifest.json`, toevoegen op topniveau:
```json
  "commands": {
    "toggle-read": {
      "suggested_key": { "default": "Alt+R" },
      "description": "Lees pagina voor of stop"
    }
  }
```

- [ ] **Step 4: Verifieer**

Run: `npm test` → PASS. Run: `npm run build && npm run lint` → OK.

- [ ] **Step 5: Commit**

```bash
git add extension/content/content.js extension/manifest.json extension/content/playerbar.js tests/playerbar.test.js extension/background/background.js
git commit -m "Content-wiring: extractie, highlighting, meescrollen, seek en Alt+R

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 14: Integratietest van de volledige content-flow

Test in jsdom met een gefake`browser`-object: TOGGLE → START-bericht met zinnen; gesimuleerde playerevents → zichtbare zin- en woord-highlights; `end` → DOM hersteld.

**Files:**
- Test: `tests/integration.test.js`

**Interfaces:**
- Consumes: alles; dit is de ketentest over Task 1–13 heen.

- [ ] **Step 1: Schrijf de test**

`tests/integration.test.js`:
```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { MSG, CONTROL } from '../extension/shared/messages.js';

describe('content-flow (integratie)', () => {
  let sent;
  let listener;

  beforeEach(async () => {
    document.documentElement.lang = 'nl'; // innerHTML-veeg laat attributen van <html> ongemoeid
    document.documentElement.innerHTML = readFileSync('tests/fixtures/article.html', 'utf8')
      .replace(/[\s\S]*<html[^>]*>/, '').replace(/<\/html>[\s\S]*/, '');
    sent = [];
    globalThis.browser = {
      runtime: {
        onMessage: { addListener: (fn) => { listener = fn; } },
        sendMessage: (m) => { sent.push(m); return Promise.resolve(); },
      },
    };
    // Vers importeren per test zodat module-state niet lekt tussen tests.
    await import(`../extension/content/content.js?test=${Date.now()}`);
  });

  it('stuurt START met zinnen en taal bij TOGGLE', () => {
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    expect(start).toBeTruthy();
    expect(start.sentences.length).toBeGreaterThanOrEqual(4);
    expect(start.sentences.map((s) => s.text)).toContain('De kat zat op de mat.');
    expect(start.lang).toBe('nl'); // uit lang-attribuut van de fixture
    expect(document.getElementById('tts-lnx-playerbar')).not.toBeNull();
  });

  it('highlight zin en woord bij playerevents', () => {
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    const idx = start.sentences.findIndex((s) => s.text === 'De kat zat op de mat.');
    listener({ type: MSG.EVENT, event: {
      type: 'sentence-start', index: idx,
      boundaries: [
        { text: 'De', offsetMs: 0, durationMs: 100 },
        { text: 'kat', offsetMs: 100, durationMs: 200 },
        { text: 'zat', offsetMs: 300, durationMs: 200 },
      ],
    }});
    expect(document.querySelector('.tts-sentence')?.textContent).toBe('De kat zat op de mat.');
    listener({ type: MSG.EVENT, event: { type: 'progress', index: idx, elapsedMs: 150 } });
    expect(document.querySelector('.tts-word')?.textContent).toBe('kat');
  });

  it('ruimt alles op bij end', () => {
    const before = document.body.innerHTML;
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    listener({ type: MSG.EVENT, event: { type: 'sentence-start', index: 0, boundaries: [] } });
    expect(document.querySelector('.tts-sentence')).not.toBeNull();
    listener({ type: MSG.EVENT, event: { type: 'end' } });
    expect(document.querySelector('.tts-sentence')).toBeNull();
    expect(document.getElementById('tts-lnx-playerbar')).toBeNull();
    expect(document.body.innerHTML).toBe(before);
  });

  it('stuurt SEEK bij klik op een alinea', () => {
    listener({ type: MSG.TOGGLE });
    const start = sent.find((m) => m.type === MSG.START);
    const target = start.sentences.find((s) => s.text.includes('De muis rende'));
    const p = [...document.querySelectorAll('p')].find((el) => el.textContent.includes('De muis rende'));
    p.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sent).toContainEqual({ type: MSG.CONTROL, action: CONTROL.SEEK, value: target.id });
  });

  it('TOGGLE tijdens afspelen stopt en ruimt op', () => {
    listener({ type: MSG.TOGGLE });
    sent.length = 0;
    listener({ type: MSG.TOGGLE });
    expect(sent).toContainEqual({ type: MSG.CONTROL, action: CONTROL.STOP, value: undefined });
    expect(document.getElementById('tts-lnx-playerbar')).toBeNull();
  });
});
```

- [ ] **Step 2: Draai de test — moet PASSEN**

Run: `npx vitest run tests/integration.test.js`
Expected: 5 tests PASS. Daarna hele suite: `npm test` → alles groen.

Mogelijke valkuilen bij falen:
- `content.js` gebruikt `browser.runtime.onMessage.addListener` op import-niveau → de fake moet vóór de import staan (staat in beforeEach).
- Module-cache: de query-parameter in de import-URL forceert een verse module per test.
- Readability in jsdom: zie opmerking bij Task 6 als de fixture niet herkend wordt.

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.js
git commit -m "Integratietest: volledige content-flow met gefakede browser-API

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 15: README, licentie, packaging en handmatige smoke-test

**Files:**
- Create: `README.md`, `LICENSE` (MPL-2.0)

- [ ] **Step 1: README.md (Nederlands)**

```markdown
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
```

- [ ] **Step 2: LICENSE toevoegen**

Run: `curl -L https://www.mozilla.org/media/MPL/2.0/index.815ca599c9df.txt -o LICENSE`
Verifieer dat het bestand begint met "Mozilla Public License Version 2.0". Zo niet: haal de tekst van https://www.mozilla.org/en-US/MPL/2.0/ en sla handmatig op.

- [ ] **Step 3: Handmatige smoke-test** (vereist desktop-Firefox met audio)

Run: `npm run build && npm start`, dan:

1. Open een Nederlands nieuwsartikel (bijv. nu.nl) → klik werkbalkknop → spraak klinkt, zin highlight, woord highlight loopt mee, pagina scrollt mee.
2. Pauze/hervat, vorige/volgende zin, snelheid op 1,5×, stop — alles reageert.
3. Alt+R start en stopt voorlezen.
4. Klik op een andere alinea → voorlezen springt daarheen.
5. about:addons → TTS LNX Browser → Voorkeuren → kies `nl-NL-MaartenNeural` → opnieuw voorlezen gebruikt die stem.
6. Netwerk uitschakelen → werkbalkknop → foutmelding "Voorlezen mislukt: ..." verschijnt netjes (geen crash).
7. Engelse pagina (bijv. bbc.com) → Engelse stem wordt gebruikt.
8. `npm run package` → zip in `web-ext-artifacts/` wordt gebouwd zonder errors.

Fouten of afwijkingen: noteer en los op vóór de laatste commit.

- [ ] **Step 4: Eindcommit + push**

```bash
git add README.md LICENSE
git commit -m "README, MPL-2.0-licentie en packaging-configuratie

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push origin main
```

---

## Self-review (uitgevoerd bij het schrijven van dit plan)

**Spec-dekking (fase 1 uit de spec):**
- Edge TTS engine ✓ Task 4–5 · Readability-extractie + body-fallback ✓ Task 6 ·
  zinsplitsing ✓ Task 2 · playerbar met bediening + snelheid ✓ Task 11 ·
  woord-/zin-highlighting ✓ Task 7 + 13 · meescrollen ✓ Task 13 (`scrollIntoView`) ·
  prefetch ✓ Task 9 · klik-op-zin ✓ Task 13 (alinea-niveau, gedocumenteerd in README) ·
  Alt+R ✓ Task 13 · taaldetectie (lang-attr + heuristiek) ✓ Task 3 + 13 ·
  instellingen (stem per taal, snelheid, engine-pref) ✓ Task 8 + 12 ·
  foutmeldingen (geen tekst / engine-error) ✓ Task 13 ·
  beperkte host-permissions ✓ Task 1 manifest · testaanpak ✓ alle taken + Task 14.
- Fase 2 (Piper) en fase 3 (PDF) vallen buiten dit plan; de engine-interface
  (Task 5) en `enginePref`-instelling (Task 8) leggen de aansluiting al vast.

**Type-consistentie gecontroleerd:** `synthesize({text, voice, rate})` →
`{audio, boundaries}` overal hetzelfde; boundaries `{text, offsetMs, durationMs}`;
audio-adapter `play/pause/resume/stop/currentTimeMs`; events
`init/sentence-start/sentence-end/progress/state/end/error`; `CONTROL.*` en
`MSG.*` consistent gebruikt; `createPlayerBar` levert `{el, setPlaying, setRate, destroy, _shadow}`.

**Bewuste afwijkingen van de spec (gedocumenteerd in README):**
klik-seek op alinea- i.p.v. zin-niveau; snelheid geldt vanaf volgende zin;
geen automatische Edge→Piper-failover in MVP (geen tweede engine om op terug
te vallen).
