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
    <p id="saved" hidden>Opgeslagen ✓</p>`;
});

describe('initOptions', () => {
  it('vult stem-selects per taal en laadt opgeslagen waarden', async () => {
    const storage = fakeStorage({ rate: 1.5, voiceOverrides: { nl: 'nl-NL-MaartenNeural' } });
    await initOptions(document, storage);
    expect(document.getElementById('rate').value).toBe('1.5');
    const nlSelect = document.querySelector('select[data-lang="nl"]');
    expect(nlSelect.value).toBe('nl-NL-MaartenNeural');
    expect(Object.keys(VOICES).every((l) => document.querySelector(`select[data-lang="${l}"]`))).toBe(true);
  });

  it('slaat wijzigingen direct op', async () => {
    const storage = fakeStorage();
    await initOptions(document, storage);
    const rate = document.getElementById('rate');
    rate.value = '2';
    rate.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(storage._d.rate).toBe(2);
    expect(document.getElementById('saved').hidden).toBe(false);
  });
});
