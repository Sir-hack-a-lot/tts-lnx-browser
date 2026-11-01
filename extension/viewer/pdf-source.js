// Zuivere hulpfuncties rond pdf.js-tekstextractie (vrij testbaar in jsdom).

// Bouwt de brontekst voor de zinsplitter uit pdf.js-tekstitems. pdf.js
// combineert items binnen een regel al (met spaties waar die visueel staan);
// regel-einden (hasEOL) worden newlines zodat zinnen niet aan elkaar plakken.
export function buildSourceText(items) {
  return (items ?? []).map((item) => item.str + (item.hasEOL ? '\n' : '')).join('');
}

// Bestandsnaam uit de bron-URL, voor de tab-titel van de viewer.
export function fileNameFromSrc(src) {
  try {
    const path = new URL(src).pathname;
    const name = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
    return name || null;
  } catch {
    return null;
  }
}
