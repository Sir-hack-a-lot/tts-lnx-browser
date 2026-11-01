// PDF-viewer: rendert de PDF met pdf.js (canvas + tekstlaag) en sluit de
// gedeelde voorleessessie (session.js) op de tekstlaag aan. De pagina wordt
// geopend via een webRequest-redirect uit background.js (?src=<pdf-url>).
import { MSG } from '../shared/messages.js';
import { attachReader } from '../content/session.js';
import { splitSentences } from '../content/sentence-split.js';
import { detectLanguage } from '../content/language-detect.js';
import { msg } from '../shared/i18n.js';
import { buildSourceText, fileNameFromSrc } from './pdf-source.js';

const MAX_SENTENCES = 1500;

const statusEl = document.getElementById('status');
const pagesEl = document.getElementById('pages');

function setStatus(text) {
  statusEl.textContent = text ?? '';
}

const src = new URLSearchParams(location.search).get('src');
if (!src) {
  setStatus(msg('viewerNoSrc'));
} else {
  const fileName = fileNameFromSrc(src);
  if (fileName) document.title = `${fileName} — TTS LNX Browser`;
  setStatus(msg('viewerLoading'));
  main(src).catch((err) => {
    setStatus(msg('viewerLoadFailed', String(err?.message || err)));
  });
}

async function main(pdfSrc) {
  // Extension-pagina's zijn geen content scripts: registreer het eigen tab-id
  // direct bij de background zodat die berichten via runtime.sendMessage
  // routeert (zie de toTab-filter in session.js).
  const tab = await browser.tabs.getCurrent();
  const routedTabId = tab?.id ?? null;
  if (routedTabId !== null) {
    await browser.runtime.sendMessage({ type: MSG.VIEWER_HELLO, tabId: routedTabId }).catch(() => {});
  }

  // pdf.js (v6) gebruikt Promise.withResolvers (Firefox 121+); polyfill voor
  // oudere versies. Module-workers (114+) vallen vanzelf terug op een
  // "fake worker" op de hoofdthread. De polyfill moet vóór de import staan,
  // vandaar een dynamische import i.p.v. een statische.
  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function withResolvers() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('viewer/pdf.worker.min.mjs');

  // withCredentials: PDF's achter een login halen we met cookies op.
  const pdf = await pdfjs.getDocument({ url: pdfSrc, withCredentials: true }).promise;

  const sentences = [];
  const pushText = (text) => {
    for (const s of splitSentences(text)) {
      if (sentences.length >= MAX_SENTENCES) return true;
      sentences.push({ id: sentences.length, text: s });
    }
    return false;
  };

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // Schaal: pagina passend in het venster (met marges), minimaal leesbaar.
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(document.documentElement.clientWidth - 32, 1200);
    const viewport = page.getViewport({ scale: Math.max(targetWidth / baseViewport.width, 0.5) });

    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.style.width = `${Math.floor(viewport.width)}px`;
    pageEl.style.height = `${Math.floor(viewport.height)}px`;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    pageEl.appendChild(canvas);
    const textLayerEl = document.createElement('div');
    textLayerEl.className = 'textLayer';
    pageEl.appendChild(textLayerEl);
    pagesEl.appendChild(pageEl);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const textLayer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent(),
      container: textLayerEl,
      viewport,
    });
    await textLayer.render();

    const textContent = await page.getTextContent();
    if (pushText(buildSourceText(textContent.items))) break;
    setStatus(msg('viewerLoadingPage', [String(pageNum), String(pdf.numPages)]));
  }
  setStatus(null);

  if (!sentences.length) {
    // Gescande PDF zonder tekstlaag (geen OCR in scope).
    setStatus(msg('viewerNoText'));
    return;
  }

  // De sessie pas aankoppelen als de zinnenlijst klaar is; de extract-closure
  // verwijst naar dezelfde array, dus die hoeft niet opnieuw opgebouwd.
  attachReader(document, {
    extract: (selectionText) => selectionText !== null
      ? splitSentences(selectionText).map((text, id) => ({ id, text }))
      : sentences,
    detectLang: (sample) => detectLanguage(sample) || null,
    seekBlockSelector: '.page',
    routedTabId,
  });
}
