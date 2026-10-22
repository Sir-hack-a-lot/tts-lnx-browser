import { describe, it, expect } from 'vitest';
import { MSG, CONTROL } from '../extension/shared/messages.js';

describe('messages', () => {
  it('heeft unieke berichttypen', () => {
    const values = Object.values(MSG);
    expect(new Set(values).size).toBe(values.length);
  });
  it('heeft alle control-actions', () => {
    expect(CONTROL).toMatchObject({ PAUSE: 'pause', RESUME: 'resume', NEXT: 'next', PREV: 'prev', STOP: 'stop', SEEK: 'seek', RATE: 'rate' });
  });
});
