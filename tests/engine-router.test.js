import { describe, it, expect } from 'vitest';
import { createRouter } from '../extension/background/engine-router.js';

const maak = (health, pref) => createRouter({
  helperEngine: {
    available: () => Promise.resolve(health !== null),
    health: () => Promise.resolve(health),
    synthesize: ({ engine }) => Promise.resolve({ engine }),
  },
  settings: { load: () => Promise.resolve({ enginePref: pref }) },
});

describe('engine-router', () => {
  it('cloud-pref kiest edge', async () => {
    const r = await maak({ engines: { edge: true, piper: true } }, 'cloud');
    expect((await r.synthesize({})).engine).toBe('edge');
  });
  it('local-pref kiest piper', async () => {
    const r = await maak({ engines: { edge: true, piper: true } }, 'local');
    expect((await r.synthesize({})).engine).toBe('piper');
  });
  it('local-first valt terug op edge zonder piper', async () => {
    const r = await maak({ engines: { edge: true, piper: false } }, 'local-first');
    expect((await r.synthesize({})).engine).toBe('edge');
  });
  it('helper offline gooit helper-offline', async () => {
    await expect(maak(null, 'cloud').then((r) => r.synthesize({}))).rejects.toThrow('helper-offline');
  });
});
