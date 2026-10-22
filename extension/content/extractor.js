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
