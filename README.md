# TTS LNX Browser

_[Nederlandse versie](README.nl.md)_

A Firefox extension for Linux that reads web pages and PDFs aloud with
natural-sounding neural voices — the "Read Aloud" feature Edge and Chrome
have on Windows and macOS, but for Linux.

## How it works

The extension talks over HTTP to a small local helper (`tts-lnx-helper`, on
127.0.0.1:5020) with two engines, and renders PDFs in its own pdf.js viewer
so they can be read aloud too:

- **edge** — proxy to Edge TTS (Microsoft, cloud): best-quality voices and
  real word timing.
- **piper** — fully local and offline: word timing is estimated
  (proportionally), so word-level highlighting is slightly less tight.

See `docs/superpowers/specs/` for the design documents.

## Installation

The extension needs the helper; reading aloud does not work without it.

1. Install and start the helper — pick one of the two options (see also
   `helper/README.md`):

   **AppImage** (no Python needed; includes the piper engine *and* the Dutch
   voice, so it works offline out of the box):

       # Download tts-lnx-helper-x86_64.AppImage from GitHub Releases
       chmod +x tts-lnx-helper-x86_64.AppImage
       ./tts-lnx-helper-x86_64.AppImage

   **pipx:**

       pipx install 'tts-lnx-helper[piper]'
       tts-lnx-helper          # runs on 127.0.0.1:5020

   The `[piper]` extra installs the local piper engine; without it only the
   cloud engine (edge) works.

2. Optionally start the helper automatically at login (pipx install):

       tts-lnx-helper-autostart install

3. Install the extension in Firefox from
   [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/tts-lnx-browser/)
   (once listed), or build from source with `npm run package` and load
   `web-ext-artifacts/tts_lnx_browser-<version>.zip` via about:addons, or run
   temporarily with `npm start`.

On first use of the piper engine, the Dutch voice (nl_NL-mls-medium) is
downloaded to `~/.local/share/tts-lnx-helper/voices/`.

## Development

    npm install
    npm test          # unit and integration tests (Vitest)
    npm run build     # bundles to dist/
    npm run lint      # web-ext lint
    npm start         # starts Firefox with the extension loaded
    npm run package   # builds web-ext-artifacts/tts_lnx_browser-<version>.zip

`npm start` uses `scripts/run-dev.sh`, which sets TMPDIR under `$HOME` so
that snap Firefox can read the temporary web-ext profile (otherwise:
"Your Firefox profile cannot be loaded").

Helper development: see `helper/README.md` (tests:
`cd helper && .venv/bin/python -m pytest tests/ -q`).

## Usage

- Click the speaker icon in the toolbar, or press **Alt+R**.
- The player bar at the bottom: previous/next sentence, pause, stop, speed
  (0.5×–2×).
- The current sentence lights up and the page scrolls along; the current word
  is highlighted as well.
- Click a paragraph to start reading from that point.
- Select text and choose **"Read selection aloud"** from the right-click menu
  to hear only that selection.
- **PDFs** automatically open in the built-in viewer (pdf.js) so they can be
  read aloud; the same controls, highlighting and selection reading apply
  there. PDF downloads (attachments) are left alone.
- Settings (about:addons → TTS LNX Browser → Preferences): default speed,
  voice per language (Dutch, English, German, French, Spanish) and engine
  choice:
  - **Cloud (Edge TTS — best-quality voices)**
  - **Local (Piper — offline, custom voices)**
  - **Local first, cloud as fallback**
- If the helper is not running, the player bar shows an installation notice;
  the extension does not crash and works again as soon as the helper starts.

## Privacy

- Engine **edge**: the page text goes via the local helper to Microsoft
  (Edge TTS).
- Engine **piper**: fully local processing, no network traffic with page text.
- The helper listens only on 127.0.0.1, writes no page text to disk and logs
  no content. The extension collects no data.

## Known limitations

- The Edge TTS API is unofficial; if it changes, cloud reading may break
  temporarily (the piper engine is independent of this).
- Word highlighting with the piper engine is an estimate and may run slightly
  ahead of or behind the audio.
- Changing speed applies from the next sentence onwards.
- Click-to-seek jumps to the first sentence of the clicked paragraph.
- PDFs without a text layer (scanned documents) cannot be read aloud; OCR is
  not included. `file://` PDFs are not intercepted.
- The PDF viewer bundles pdf.js (Apache-2.0).

## License

MPL-2.0, see LICENSE.
