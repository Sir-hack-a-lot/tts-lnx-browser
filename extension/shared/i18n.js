// Vertaalde UI-teksten via de WebExtension-i18n-API (_locales/).
// In tests (geen browser-global) valt msg() terug op de message-key zelf,
// zodat componenten zonder mock ook renderen.
export function msg(name, substitutions) {
  const m = globalThis.browser?.i18n?.getMessage?.(name, substitutions);
  return m || name;
}

// UI-taal van de browser ('nl', 'en', …) voor o.a. getalnotatie;
// undefined buiten de browsercontext (tests).
export function uiLanguage() {
  return globalThis.browser?.i18n?.getUILanguage?.();
}
