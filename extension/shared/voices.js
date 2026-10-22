// Samengestelde lijst van Edge TTS neurale stemmen, gerankt op voorkeur.
// (Fase 2 voegt Piper-stemmen van de helper toe via dezelfde interface.)
export const VOICES = {
  nl: ['nl-NL-FennaNeural', 'nl-NL-MaartenNeural', 'nl-NL-ColetteNeural'],
  en: ['en-US-JennyNeural', 'en-GB-SoniaNeural', 'en-US-GuyNeural'],
  de: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
  fr: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
  es: ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
};

export const DEFAULT_LANG = 'nl';

// Bepaalt de te gebruiken stem: override > eerste stem van de taal > DEFAULT_LANG.
export function resolveVoice(lang, voiceOverrides = {}) {
  const known = VOICES[lang] ? lang : DEFAULT_LANG;
  return voiceOverrides[known] || VOICES[known][0];
}
