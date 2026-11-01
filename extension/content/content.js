// Applicatie-entry in de pagina: extractie, highlighting, playerbar, seek.
import { MSG, CONTROL } from '../shared/messages.js';
import { extractArticle, locateSentence } from './extractor.js';
import { detectLanguage } from './language-detect.js';
import { createHighlighter, HIGHLIGHT_CSS } from './highlighter.js';
import { createPlayerBar } from './playerbar.js';
import { msg } from '../shared/i18n.js';

let active = false;
let sentences = [];
let highlighter = null;
let bar = null;
let styleEl = null;
let lastPos = { node: null, end: 0 }; // zoekpointer: laatste gelokaliseerde positie
let lastIndex = -1; // index van de laatst gelokaliseerde zin (-1 = geen)
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
  lastIndex = -1;
  currentBoundaries = [];
  wordPos = 0;
  lastWordIndex = -1;
  active = false;
}

function startReading() {
  const { sentences: found } = extractArticle(document);
  if (!found.length) {
    showNotice(msg('noticeNoText'));
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
  // Bij een sprong (seek vooruit/achteruit) is de voorwaartse zoekpointer
  // ongeldig; reset hem zodat locateSentence weer vanaf het begin zoekt.
  if (event.index !== lastIndex + 1) lastPos = { node: null, end: 0 };
  lastIndex = event.index;
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
    case 'init':
      if (event.rate != null) bar?.setRate(event.rate);
      if (event.engine) bar?.setEngine(event.engine);
      break;
    case 'sentence-start': onSentenceStart(event); break;
    case 'progress': onProgress(event); break;
    case 'state': bar?.setPlaying(event.state === 'playing'); break;
    case 'end': cleanup(); break;
    // Een andere tab heeft de sessie overgenomen: alleen lokaal opruimen,
    // geen STOP terugsturen (die zou de nieuwe sessie raken).
    case 'taken-over': cleanup(); break;
    case 'error':
      // Helper draait niet: toon de installatie-instructie i.p.v. een kale fout.
      showNotice(event.message === 'helper-offline'
        ? msg('noticeHelperOffline')
        : msg('noticeReadFailed', event.message));
      cleanup();
      break;
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
