import { describe, it, expect } from 'vitest';
import { createSettings, DEFAULTS } from '../extension/shared/settings.js';

function fakeStorage(initial = {}) {
  return {
    _d: { ...initial },
    async get(defaults) { return { ...defaults, ...this._d }; },
    async set(obj) { Object.assign(this._d, obj); },
  };
}

describe('createSettings', () => {
  it('levert defaults bij lege storage', async () => {
    const s = createSettings(fakeStorage());
    await s.load();
    expect(s.get('rate')).toBe(1);
    expect(s.get('enginePref')).toBe('cloud');
  });
  it('leest opgeslagen waarden over defaults heen', async () => {
    const s = createSettings(fakeStorage({ rate: 1.5 }));
    await s.load();
    expect(s.get('rate')).toBe(1.5);
    expect(s.get('enginePref')).toBe('cloud'); // default blijft
  });
  it('set() werkt cache en storage bij', async () => {
    const storage = fakeStorage();
    const s = createSettings(storage);
    await s.load();
    await s.set({ voiceOverrides: { nl: 'nl-NL-MaartenNeural' } });
    expect(s.get('voiceOverrides')).toEqual({ nl: 'nl-NL-MaartenNeural' });
    expect(storage._d.voiceOverrides).toEqual({ nl: 'nl-NL-MaartenNeural' });
  });
  it('load() vult ontbrekende sleutels met DEFAULTS', async () => {
    const s = createSettings(fakeStorage({ rate: 2 }));
    const loaded = await s.load();
    expect(loaded).toEqual({ ...DEFAULTS, rate: 2 });
  });
});
