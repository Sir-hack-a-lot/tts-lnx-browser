// Stemmenlijst per taal. Elke stem hoort bij één engine: 'edge' (cloud via de
// helper) of 'piper' (lokaal via de helper). Nieuwe piper-stemmen kunnen hier
// worden toegevoegd zodra ze in de helper geïnstalleerd zijn.
export const VOICES = {
  nl: [
    { id: 'nl-NL-FennaNeural', engine: 'edge' },
    { id: 'nl-NL-MaartenNeural', engine: 'edge' },
    { id: 'nl-NL-ColetteNeural', engine: 'edge' },
    { id: 'nl_NL-mls-medium', engine: 'piper' },
  ],
  en: [
    { id: 'en-US-JennyNeural', engine: 'edge' },
    { id: 'en-GB-SoniaNeural', engine: 'edge' },
    { id: 'en-US-GuyNeural', engine: 'edge' },
  ],
  de: [
    { id: 'de-DE-KatjaNeural', engine: 'edge' },
    { id: 'de-DE-ConradNeural', engine: 'edge' },
  ],
  fr: [
    { id: 'fr-FR-DeniseNeural', engine: 'edge' },
    { id: 'fr-FR-HenriNeural', engine: 'edge' },
  ],
  es: [
    { id: 'es-ES-ElviraNeural', engine: 'edge' },
    { id: 'es-ES-AlvaroNeural', engine: 'edge' },
  ],
};

export const DEFAULT_LANG = 'nl';

// Bepaalt de te gebruiken stem voor een engine: override van die engine >
// eerste stem van de taal voor die engine > zelfde via DEFAULT_LANG.
// Overrides van een andere engine worden genegeerd: voice-id's zijn
// engine-specifiek. De engine-parameter is optioneel; een aanroep zonder
// engine gedraagt zich als voorheen (edge).
export function resolveVoice(lang, voiceOverrides = {}, engine = 'edge') {
  const known = VOICES[lang] ? lang : DEFAULT_LANG;
  const forEngine = (l) => (VOICES[l] ?? []).filter((v) => v.engine === engine);
  let candidates = forEngine(known);
  // Heeft de taal geen stemmen van deze engine, val terug op DEFAULT_LANG;
  // als laatste redmiddel op álle stemmen van de taal.
  if (!candidates.length && known !== DEFAULT_LANG) candidates = forEngine(DEFAULT_LANG);
  if (!candidates.length) candidates = VOICES[known];
  const override = voiceOverrides[known];
  if (override && candidates.some((v) => v.id === override)) return override;
  return candidates[0].id;
}
