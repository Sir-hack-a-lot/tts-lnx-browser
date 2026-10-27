// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { initOptions } from '../extension/options/options.js';
import { VOICES } from '../extension/shared/voices.js';

function fakeStorage(initial = {}) {
  return {
    _d: { ...initial },
    async get(defaults) { return { ...defaults, ...this._d }; },
    async set(obj) { Object.assign(this._d, obj); },
  };
}

// Fetch die altijd faalt: helper niet bereikbaar. Tests die de statusregel
// niet controleren gebruiken deze zodat ze niet van het netwerk afhangen.
const offlineFetch = () => Promise.reject(new TypeError('fetch failed'));

beforeEach(() => {
  // De rate-select heeft zijn opties nodig; anders heeft .value zetten geen effect.
  document.body.innerHTML = `
    <select id="rate">
      <option value="0.5">0,5×</option>
      <option value="0.75">0,75×</option>
      <option value="1">1×</option>
      <option value="1.25">1,25×</option>
      <option value="1.5">1,5×</option>
      <option value="2">2×</option>
    </select>
    <div id="voices"></div>
    <input type="radio" name="pref" value="cloud">
    <input type="radio" name="pref" value="local">
    <input type="radio" name="pref" value="local-first">
    <p id="helper-status"></p>
    <p id="saved" hidden>Opgeslagen ✓</p>`;
});

describe('initOptions', () => {
  it('vult stem-selects per taal en laadt opgeslagen waarden', async () => {
    const storage = fakeStorage({ rate: 1.5, voiceOverrides: { nl: 'nl-NL-MaartenNeural' } });
    await initOptions(document, storage, { fetchImpl: offlineFetch });
    expect(document.getElementById('rate').value).toBe('1.5');
    const nlSelect = document.querySelector('select[data-lang="nl"]');
    expect(nlSelect.value).toBe('nl-NL-MaartenNeural');
    expect(Object.keys(VOICES).every((l) => document.querySelector(`select[data-lang="${l}"]`))).toBe(true);
  });

  it('slaat wijzigingen direct op', async () => {
    const storage = fakeStorage();
    await initOptions(document, storage, { fetchImpl: offlineFetch });
    const rate = document.getElementById('rate');
    rate.value = '2';
    rate.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(storage._d.rate).toBe(2);
    expect(document.getElementById('saved').hidden).toBe(false);
  });

  it('laadt de opgeslagen engine-keuze en bewaart een nieuwe keuze', async () => {
    const storage = fakeStorage({ enginePref: 'local' });
    await initOptions(document, storage, { fetchImpl: offlineFetch });
    expect(document.querySelector('input[name="pref"][value="local"]').checked).toBe(true);

    const radio = document.querySelector('input[name="pref"][value="local-first"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(storage._d.enginePref).toBe('local-first');
  });

  it('filtert de stemmenlijst op de gekozen engine en hertekent bij wissel', async () => {
    const storage = fakeStorage({ enginePref: 'local' });
    await initOptions(document, storage, { fetchImpl: offlineFetch });
    const nlOptions = () => [...document.querySelector('select[data-lang="nl"]').options].map((o) => o.value);
    expect(nlOptions()).toEqual(['nl_NL-mls-medium']);
    // Talen zonder piper-stem tonen geen select.
    expect(document.querySelector('select[data-lang="de"]')).toBeNull();

    const radio = document.querySelector('input[name="pref"][value="cloud"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(nlOptions()).toContain('nl-NL-FennaNeural');
    expect(nlOptions()).not.toContain('nl_NL-mls-medium');
    expect(document.querySelector('select[data-lang="de"]')).not.toBeNull();
  });

  it('toont bij pref local-first de stemmen van beide engines', async () => {
    const storage = fakeStorage({ enginePref: 'local-first' });
    await initOptions(document, storage, { fetchImpl: offlineFetch });
    const nlOptions = [...document.querySelector('select[data-lang="nl"]').options].map((o) => o.value);
    expect(nlOptions).toContain('nl-NL-FennaNeural');
    expect(nlOptions).toContain('nl_NL-mls-medium');
  });

  it('toont helper-status bereikbaar met het aantal piper-stemmen', async () => {
    const fetchImpl = (url) => {
      if (url.endsWith('/health')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', engines: { edge: true, piper: true } }) });
      }
      if (url.endsWith('/voices')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([
          { id: 'nl-NL-FennaNeural', engine: 'edge' },
          { id: 'nl_NL-mls-medium', engine: 'piper' },
          { id: 'en_US-lessac-medium', engine: 'piper' },
        ]) });
      }
      return Promise.reject(new Error(`onverwachte url: ${url}`));
    };
    await initOptions(document, fakeStorage(), { fetchImpl });
    const status = document.getElementById('helper-status').textContent;
    expect(status).toContain('bereikbaar');
    expect(status).not.toContain('niet');
    expect(status).toContain('2');
  });

  it('toont helper-status niet bereikbaar als de helper offline is', async () => {
    await initOptions(document, fakeStorage(), { fetchImpl: offlineFetch });
    expect(document.getElementById('helper-status').textContent).toContain('niet bereikbaar');
  });
});
