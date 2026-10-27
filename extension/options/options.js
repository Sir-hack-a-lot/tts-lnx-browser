// Instellingenpagina: vult selects vanuit VOICES (gefilterd op de gekozen
// engine), slaat direct op en toont de status van de lokale helper.
import { createSettings } from '../shared/settings.js';
import { VOICES } from '../shared/voices.js';

const LANG_LABELS = { nl: 'Nederlands', en: 'Engels', de: 'Duits', fr: 'Frans', es: 'Spaans' };
const HELPER_BASE = 'http://127.0.0.1:5020';

// Vertaal de engine-voorkeur naar de engine waar de stemmenlijst op filtert.
// Bij 'local-first' kunnen beide engines aan de beurt komen: toon alles.
function engineFilterForPref(pref) {
  if (pref === 'cloud') return 'edge';
  if (pref === 'local') return 'piper';
  return null; // 'local-first'
}

export async function initOptions(doc, storage, { fetchImpl = globalThis.fetch } = {}) {
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
  // (Her)teken de stem-selects: alleen stemmen van de engine die bij de
  // huidige voorkeur hoort. Een override van een andere engine wordt getoond
  // als de eerste stem van de filter; hij wordt pas overschreven als de
  // gebruiker de select aanraakt.
  function renderVoices(pref) {
    voicesDiv.textContent = '';
    const filter = engineFilterForPref(pref);
    const overrides = settings.get('voiceOverrides') ?? {};
    for (const [lang, voices] of Object.entries(VOICES)) {
      const shown = filter ? voices.filter((v) => v.engine === filter) : voices;
      if (!shown.length) continue; // geen stemmen van deze engine voor de taal
      const label = doc.createElement('label');
      label.textContent = `${LANG_LABELS[lang] ?? lang} `;
      const select = doc.createElement('select');
      select.dataset.lang = lang;
      for (const v of shown) {
        const opt = doc.createElement('option');
        opt.value = v.id;
        opt.textContent = v.id;
        select.appendChild(opt);
      }
      select.value = shown.some((v) => v.id === overrides[lang]) ? overrides[lang] : shown[0].id;
      select.addEventListener('change', async () => {
        const cur = settings.get('voiceOverrides') ?? {};
        await settings.set({ voiceOverrides: { ...cur, [lang]: select.value } });
        showSaved();
      });
      label.appendChild(select);
      voicesDiv.appendChild(label);
    }
  }

  const pref = s.enginePref ?? 'cloud';
  const radio = doc.querySelector(`input[name="pref"][value="${pref}"]`);
  if (radio) radio.checked = true;
  renderVoices(radio?.checked ? pref : 'cloud');
  for (const r of doc.querySelectorAll('input[name="pref"]')) {
    r.addEventListener('change', async () => {
      await settings.set({ enginePref: r.value });
      renderVoices(r.value);
      showSaved();
    });
  }

  // Helper-status: bereikbaarheid via /health, aantal piper-stemmen via
  // /voices. Fouten (helper uit, kapotte JSON) leveren "niet bereikbaar".
  const status = doc.getElementById('helper-status');
  if (status) {
    try {
      const res = await fetchImpl(`${HELPER_BASE}/health`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      let piperCount = null;
      try {
        const vres = await fetchImpl(`${HELPER_BASE}/voices`);
        if (vres.ok) {
          const list = await vres.json();
          piperCount = list.filter((v) => v.engine === 'piper').length;
        }
      } catch { /* /voices faalde: toon bereikbaarheid zonder aantal */ }
      status.textContent = piperCount === null
        ? 'Helper: bereikbaar'
        : `Helper: bereikbaar — ${piperCount} piper-stem${piperCount === 1 ? '' : 'men'} geïnstalleerd`;
    } catch {
      status.textContent = 'Helper: niet bereikbaar (draait de lokale helper?)';
    }
  }
}

// In de browser draait dit direct; in tests roepen we initOptions zelf aan.
if (typeof browser !== 'undefined' && typeof document !== 'undefined' && document.getElementById('voices')) {
  initOptions(document, browser.storage.local);
}
