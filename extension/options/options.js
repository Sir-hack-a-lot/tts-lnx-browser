// Instellingenpagina: vult selects vanuit VOICES en slaat direct op.
import { createSettings } from '../shared/settings.js';
import { VOICES } from '../shared/voices.js';

const LANG_LABELS = { nl: 'Nederlands', en: 'Engels', de: 'Duits', fr: 'Frans', es: 'Spaans' };

export async function initOptions(doc, storage) {
  const settings = createSettings(storage);
  const s = await settings.load();

  const saved = doc.getElementById('saved');
  const showSaved = () => { saved.hidden = false; setTimeout(() => { saved.hidden = true; }, 1500); };

  const rate = doc.getElementById('rate');
  rate.value = String(s.rate);
  rate.addEventListener('change', async () => {
    await settings.set({ rate: parseFloat(rate.value) });
    showSaved();
  });

  const voicesDiv = doc.getElementById('voices');
  for (const [lang, voices] of Object.entries(VOICES)) {
    const label = doc.createElement('label');
    label.textContent = `${LANG_LABELS[lang] ?? lang} `;
    const select = doc.createElement('select');
    select.dataset.lang = lang;
    for (const v of voices) {
      const opt = doc.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    select.value = s.voiceOverrides[lang] ?? voices[0];
    select.addEventListener('change', async () => {
      const cur = settings.get('voiceOverrides') ?? {};
      await settings.set({ voiceOverrides: { ...cur, [lang]: select.value } });
      showSaved();
    });
    label.appendChild(select);
    voicesDiv.appendChild(label);
  }

  const pref = s.enginePref ?? 'cloud';
  const radio = doc.querySelector(`input[name="pref"][value="${pref}"]`);
  if (radio && !radio.disabled) radio.checked = true;
  for (const r of doc.querySelectorAll('input[name="pref"]')) {
    r.addEventListener('change', async () => {
      await settings.set({ enginePref: r.value });
      showSaved();
    });
  }
}

// In de browser draait dit direct; in tests roepen we initOptions zelf aan.
if (typeof browser !== 'undefined' && typeof document !== 'undefined' && document.getElementById('voices')) {
  initOptions(document, browser.storage.local);
}
