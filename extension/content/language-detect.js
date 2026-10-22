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
