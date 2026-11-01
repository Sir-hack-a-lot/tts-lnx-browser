// Artikelextractie: Readability op een documentkloon → zinnenlijst.
// locateSentence() zoekt een zin terug in het ORIGINELE document en geeft
// tekstsegmenten [{node, start, end}] terug voor de highlighter.
import { Readability } from '@mozilla/readability';
import { splitSentences } from './sentence-split.js';

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,caption';

export function extractArticle(doc, { maxSentences = 500 } = {}) {
  const clone = doc.cloneNode(true);
  // content als DOM-node i.p.v. HTML-string (eigen serializer): het artikel-
  // fragment wordt dan geadopteerd via appendChild en hoeft niet opnieuw als
  // HTML geparsed te worden — geen innerHTML in eigen code (AMO-waarschuwing).
  const article = new Readability(clone, { serializer: (el) => el }).parse();

  const container = doc.createElement('div');
  let title = null;
  if (article?.content) {
    title = article.title || null;
    container.appendChild(article.content);
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

  // Alle tekstnodes, óók witruimte-nodes: die markeren grens-witruimte (zie hieronder).
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  const startIdx = fromNode ? Math.max(0, nodes.indexOf(fromNode)) : 0;

  // Groeiende haystack van genormaliseerde node-teksten. Nodes worden samen-
  // gevoegd zoals textContent dat doet: een spatie op de grens ALLEEN als er
  // daar écht witruimte stond (eind/begin van een node, of een tussenliggende
  // witruimte-node). Een kunstmatige spatie op elke grens breekt teksten als
  // "update(opent in nieuw venster)" — update en het haakje zijn aparte nodes
  // (link) zónder witruimte ertussen — waardoor de naald nooit past.
  const items = []; // {node, norm, map, sliceAt, base}
  let hay = '';
  let boundarySpace = false; // witruimte sinds de vorige inhoudelijke node
  for (let i = startIdx; i < nodes.length; i++) {
    const raw = nodes[i].nodeValue;
    if (!raw.trim()) { boundarySpace = true; continue; } // witruimte-node
    // Bij de fromNode beginnen we ná fromOffset (ruwe offset in die node),
    // zodat herhaalde zinnen in dezelfde tekstnode correct doorgeschakeld worden.
    const sliceAt = nodes[i] === fromNode ? fromOffset : 0;
    const { text, map } = normalizeWithMap(raw.slice(sliceAt));
    // Kan alleen leeg zijn als de slice ná fromOffset alleen witruimte bevatte;
    // die witruimte geldt alsnog als grens-witruimte voor de volgende node.
    if (!text) { boundarySpace = true; continue; }
    const prev = items[items.length - 1];
    const lead = prev !== undefined
      && (boundarySpace || prev.trail || /^\s/.test(raw.slice(sliceAt)));
    const base = hay.length + (lead ? 1 : 0);
    hay += (lead ? ' ' : '') + text;
    items.push({ node: nodes[i], norm: text, map, sliceAt, base, trail: /\s$/.test(raw) });
    boundarySpace = false;
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
  // Pass 2 — spatie-ongevoelig: Readability laat soms witruimte weg die in de
  // originele DOM wél staat (bijv. de NOS-kop "NOS Nieuws" + "gisteren, …"
  // wordt één zin "NOS Nieuwsgisteren, …"). Strip alle spaties aan beide
  // kanten en zoek opnieuw; posMap wijst terug naar (item, norm-index).
  const strippedTarget = target.replaceAll(' ', '');
  let strippedHay = '';
  const posMap = [];
  for (const item of items) {
    for (let j = 0; j < item.norm.length; j++) {
      if (item.norm[j] === ' ') continue;
      posMap.push({ item, normIdx: j });
      strippedHay += item.norm[j];
    }
  }
  const shit = strippedHay.indexOf(strippedTarget);
  if (shit !== -1) {
    const grouped = []; // {item, normStart, normEnd(exclusief)}
    for (let k = shit; k < shit + strippedTarget.length; k++) {
      const { item, normIdx } = posMap[k];
      const last = grouped[grouped.length - 1];
      if (last && last.item === item && last.normEnd === normIdx) last.normEnd = normIdx + 1;
      else grouped.push({ item, normStart: normIdx, normEnd: normIdx + 1 });
    }
    return grouped.map(({ item, normStart, normEnd }) => ({
      node: item.node,
      start: item.map[normStart] + item.sliceAt,
      end: item.map[normEnd - 1] + 1 + item.sliceAt,
    }));
  }
  // Voorwaarts zoeken mislukt (bijv. door Readability-herschikking):
  // probeer nog één keer vanaf het begin van het document.
  if (startIdx > 0) return locateSentence(doc, target);
  return null;
}
