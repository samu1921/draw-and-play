import { describe, expect, it } from 'vitest';
import { lastFinishedByPerson, restingSince } from './operations.js';

const side = (...personIds: string[]) => ({ personIds });

describe('rest times at the match desk', () => {
  const matches = [
    { status: 'finished', finishedAt: '2026-11-07T10:00:00.000Z', sides: [side('anna'), side('ben')] },
    { status: 'finished', finishedAt: '2026-11-07T10:40:00.000Z', sides: [side('anna'), side('clara')] },
    // Doubles in another competition: Ben and David together
    { status: 'finished', finishedAt: new Date('2026-11-07T10:20:00.000Z'), sides: [side('ben', 'david'), side('emma', 'felix')] },
    // Called and pending matches do not count
    { status: 'called', finishedAt: null, sides: [side('greta'), side('hannes')] },
    { status: 'ready', finishedAt: null, sides: [side('anna'), null] },
  ];
  const last = lastFinishedByPerson(matches);

  it('keeps the latest end per person across competitions', () => {
    expect(new Date(last.get('anna')!).toISOString()).toBe('2026-11-07T10:40:00.000Z');
    expect(new Date(last.get('ben')!).toISOString()).toBe('2026-11-07T10:20:00.000Z');
    expect(last.has('greta')).toBe(false);
  });

  it('takes the partner who played last for a pair', () => {
    expect(restingSince(['david', 'clara'], last)).toBe('2026-11-07T10:40:00.000Z');
    expect(restingSince(['ben'], last)).toBe('2026-11-07T10:20:00.000Z');
  });

  it('is null for players without a finished match', () => {
    expect(restingSince(['greta', 'hannes'], last)).toBeNull();
  });
});
