// Applicatie-entry in de pagina: webpagina-voorlezing via Readability.
// De sessielogica zelf zit in session.js (gedeeld met de PDF-viewer).
import { attachReader } from './session.js';
import { extractArticle } from './extractor.js';
import { splitSentences } from './sentence-split.js';
import { detectLanguage } from './language-detect.js';

attachReader(document, {
  extract: (selectionText) => selectionText !== null
    ? splitSentences(selectionText).map((text, id) => ({ id, text }))
    : extractArticle(document).sentences,
  detectLang: (sample) => document.documentElement.lang?.slice(0, 2).toLowerCase()
    || detectLanguage(sample) || null,
});
