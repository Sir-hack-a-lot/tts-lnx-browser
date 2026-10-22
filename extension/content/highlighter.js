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
