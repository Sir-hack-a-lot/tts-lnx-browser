// Tests voor de PDF-omleiding: welke responses gaan naar de eigen viewer.
import { describe, it, expect } from 'vitest';
import { pdfRedirectUrl } from '../extension/background/pdf-redirect.js';

const VIEWER = 'moz-extension://abc/viewer/viewer.html';
const details = (headers, type = 'main_frame', url = 'https://voorbeeld.nl/doc.pdf') => ({
  type,
  url,
  responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })),
});

describe('pdfRedirectUrl', () => {
  it('leidt een PDF in het hoofdframe om naar de viewer', () => {
    const url = pdfRedirectUrl(details({ 'Content-Type': 'application/pdf' }), VIEWER);
    expect(url).toBe(`${VIEWER}?src=${encodeURIComponent('https://voorbeeld.nl/doc.pdf')}`);
  });

  it('matcht content-type hoofdletterongevoelig en met charset', () => {
    const d = details({ 'content-type': 'Application/PDF; charset=binary' });
    expect(pdfRedirectUrl(d, VIEWER)).not.toBeNull();
  });

  it('laat subresources (iframe, object) met rust', () => {
    const d = details({ 'Content-Type': 'application/pdf' }, 'sub_frame');
    expect(pdfRedirectUrl(d, VIEWER)).toBeNull();
  });

  it('laat downloads (attachment) downloaden', () => {
    const d = details({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="doc.pdf"',
    });
    expect(pdfRedirectUrl(d, VIEWER)).toBeNull();
  });

  it('laat inline-disposition wél omleiden', () => {
    const d = details({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="doc.pdf"',
    });
    expect(pdfRedirectUrl(d, VIEWER)).not.toBeNull();
  });

  it('laat niet-PDF-responses met rust', () => {
    expect(pdfRedirectUrl(details({ 'Content-Type': 'text/html' }), VIEWER)).toBeNull();
    expect(pdfRedirectUrl(details({}), VIEWER)).toBeNull();
    expect(pdfRedirectUrl({ type: 'main_frame', url: 'https://x.nl' }, VIEWER)).toBeNull();
  });
});
