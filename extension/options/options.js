// Instellingenpagina: vult selects vanuit VOICES (gefilterd op de gekozen
// engine), slaat direct op en toont de status van de lokale helper.
import { createSettings } from '../shared/settings.js';
import { VOICES } from '../shared/voices.js';
import { msg, uiLanguage } from '../shared/i18n.js';

const HELPER_BASE = 'http://127.0.0.1:5020';

// Vervang de statische (Engelse) teksten in options.html door de vertaling
// van de browsertaal. Zonder i18n-context (tests) blijven de defaults staan.
function localizeStatic(doc) {
  const lang = uiLanguage();
  if (lang) doc.documentElement.lang = lang;
  doc.title = msg('optionsTitle');
  for (const el of doc.querySelectorAll('[data-i18n]')) {
    el.textContent = msg(el.dataset.i18n);
  }
}

// Vertaal de engine-voorkeur naar de engine waar de stemmenlijst op filtert.
// Bij 'local-first' kunnen beide engines aan de beurt komen: toon alles.
function engineFilterForPref(pref) {
  if (pref === 'cloud') return 'edge';
  if (pref === 'local') return 'piper';
  return null; // 'local-first'
}

export async function initOptions(doc, storage, { fetchImpl = globalThis.fetch } = {}) {
  localizeStatic(doc);
  const settings = createSettings(storage);
  const s = await settings.load();

  // Getalnotatie van de snelheidsopties volgt de UI-taal.
  const rateFmt = new Intl.NumberFormat(uiLanguage());
  for (const opt of doc.querySelectorAll('#rate option')) {
    opt.textContent = `${rateFmt.format(parseFloat(opt.value))}×`;
  }

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
      label.textContent = `${msg(`lang${lang[0].toUpperCase()}${lang.slice(1)}`)} `;
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
        ? msg('optionsHelperReachable')
        : msg('optionsHelperReachableVoices', String(piperCount));
    } catch {
      status.textContent = msg('optionsHelperUnreachable');
    }
  }
}

// In de browser draait dit direct; in tests roepen we initOptions zelf aan.
if (typeof browser !== 'undefined' && typeof document !== 'undefined' && document.getElementById('voices')) {
  initOptions(document, browser.storage.local);
}
