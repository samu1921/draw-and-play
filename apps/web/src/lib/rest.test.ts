import { describe, expect, it } from 'vitest';
import { matchRest, restMinutes } from './rest.js';

const now = new Date('2026-11-07T11:00:00Z').getTime();

describe('restMinutes', () => {
  it('counts whole minutes since the last match', () => {
    expect(restMinutes('2026-11-07T10:35:30Z', now)).toBe(24);
  });

  it('is null without a match played and never negative', () => {
    expect(restMinutes(null, now)).toBeNull();
    expect(restMinutes(undefined, now)).toBeNull();
    expect(restMinutes('2026-11-07T11:05:00Z', now)).toBe(0);
  });
});

describe('matchRest', () => {
  it('is the shorter rest of both sides', () => {
    expect(matchRest([{ restingSince: '2026-11-07T10:30:00Z' }, { restingSince: '2026-11-07T10:55:00Z' }], now)).toBe(5);
  });

  it('treats a side without a match as fully rested', () => {
    expect(matchRest([{ restingSince: null }, { restingSince: '2026-11-07T10:40:00Z' }], now)).toBe(20);
    expect(matchRest([{ restingSince: null }, null], now)).toBe(Number.POSITIVE_INFINITY);
  });
});
