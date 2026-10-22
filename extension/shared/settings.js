// Dunne wrapper om browser.storage.local met defaults en een in-memory cache.
export const DEFAULTS = {
  rate: 1,
  enginePref: 'cloud', // fase 2: 'local-first' | 'local-only'
  voiceOverrides: {},  // {nl: 'nl-NL-MaartenNeural', ...}
};

export function createSettings(storage) {
  let cache = { ...DEFAULTS };
  return {
    async load() {
      const stored = await storage.get(DEFAULTS);
      cache = { ...DEFAULTS, ...stored };
      return cache;
    },
    get(key) {
      return cache[key];
    },
    async set(patch) {
      cache = { ...cache, ...patch };
      await storage.set(patch);
      return cache;
    },
  };
}
