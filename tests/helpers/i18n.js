// browser.i18n-mock voor jsdom-tests, gevoed door de echte Engelse
// berichten — zo testen we dezelfde strings als de extensie toont.
import en from '../../extension/_locales/en/messages.json';

export function i18nMock() {
  return {
    getMessage: (name, substitutions) => {
      let m = en[name]?.message ?? '';
      if (substitutions != null) {
        const list = Array.isArray(substitutions) ? substitutions : [substitutions];
        list.forEach((s, i) => { m = m.replaceAll(`$${i + 1}`, String(s)); });
      }
      return m;
    },
    getUILanguage: () => 'en',
  };
}
