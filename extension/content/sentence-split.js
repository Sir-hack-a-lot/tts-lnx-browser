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
