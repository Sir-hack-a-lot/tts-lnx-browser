// Diagnose: simuleert de content.js-flow op een echt artikel en meet hoeveel
// zinnen locateSentence NIET terugvindt in het originele document.
// Gebruik: node scripts/diagnose-locate.mjs <pad-naar.html>
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { extractArticle, locateSentence } from '../extension/content/extractor.js';

const html = readFileSync(process.argv[2], 'utf8');
const dom = new JSDOM(html);
const doc = dom.window.document;
globalThis.NodeFilter = dom.window.NodeFilter;

const { title, sentences } = extractArticle(doc);
console.log(`Titel: ${title}`);
console.log(`Zinnen geëxtraheerd: ${sentences.length}`);

// Exact de forward-pointer-logica uit content.js onSentenceStart.
let lastPos = { node: null, end: 0 };
let lastIndex = -1;
const misses = [];
for (const sentence of sentences) {
  if (sentence.id !== lastIndex + 1) lastPos = { node: null, end: 0 };
  lastIndex = sentence.id;
  const segs = locateSentence(doc, sentence.text, { fromNode: lastPos.node, fromOffset: lastPos.end });
  if (!segs) {
    misses.push(sentence);
  } else {
    lastPos = { node: segs[segs.length - 1].node, end: segs[segs.length - 1].end };
  }
}

console.log(`Niet gelokaliseerd: ${misses.length} van ${sentences.length}`);
for (const m of misses.slice(0, 10)) {
  console.log(`  [${m.id}] ${m.text.slice(0, 100)}`);
}
// Controle: bestaan de gemiste zinnen WEL letterlijk in de paginatekst?
if (misses.length) {
  const bodyText = doc.body.textContent.replace(/\s+/g, ' ');
  const reallyThere = misses.filter((m) => bodyText.includes(m.text)).length;
  console.log(`...waarvan de tekst letterlijk in body voorkomt: ${reallyThere}`);
}
