// Beslist of een main_frame-response een PDF is die in de eigen viewer geopend
// moet worden. De ingebouwde Firefox-PDF-viewer blokkeert content scripts,
// dus PDF-navigaties worden omgeleid naar viewer/viewer.html (pdf.js).
// Zuivere functie: vrij testbaar zonder browser-mocks.
export function pdfRedirectUrl(details, viewerBaseUrl) {
  if (details.type !== 'main_frame') return null;
  const headers = details.responseHeaders ?? [];
  const get = (name) => headers
    .find((h) => h.name.toLowerCase() === name)?.value?.toLowerCase() ?? '';
  if (!get('content-type').includes('application/pdf')) return null;
  // Bijlage-downloads (Content-Disposition: attachment) met rust laten:
  // de gebruiker wil het bestand opslaan, niet bekijken.
  if (get('content-disposition').includes('attachment')) return null;
  return `${viewerBaseUrl}?src=${encodeURIComponent(details.url)}`;
}
