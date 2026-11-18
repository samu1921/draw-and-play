import { describe, expect, it } from 'vitest';
import { competitionProgress, nextOrder, normalizeSearch, recentOrder, sidesMatch } from './publicMatches.js';

describe('normalizeSearch', () => {
  it('ignores case, accents and surrounding spaces', () => {
    expect(normalizeSearch('  Jörg MÜLLER ')).toBe('jorg muller');
    expect(normalizeSearch('Élodie')).toBe('elodie');
  });
});

describe('sidesMatch', () => {
  const sides = [{ name: 'Jörg Müller', clubs: ['TTC Musterstadt'] }, null];

  it('finds a player by part of the name, without accents', () => {
    expect(sidesMatch(sides, normalizeSearch('muller'))).toBe(true);
    expect(sidesMatch(sides, normalizeSearch('jörg'))).toBe(true);
  });

  it('finds a player by club', () => {
    expect(sidesMatch(sides, normalizeSearch('musterstadt'))).toBe(true);
  });

  it('matches everything without a search and nothing for a stranger', () => {
    expect(sidesMatch(sides, '')).toBe(true);
    expect(sidesMatch(sides, normalizeSearch('Schulz'))).toBe(false);
  });
});

describe('nextOrder', () => {
  const m = (key: string, busy = false) => ({ competitionId: 'c', key, busy });

  it('follows the planned starts, matches without a plan last', () => {
    const planned = new Map([
      ['c:b', 600],
      ['c:c', 630],
    ]);
    expect(nextOrder([m('a'), m('c'), m('b')], planned).map((x) => x.key)).toEqual(['b', 'c', 'a']);
  });

  it('puts matches waiting for a player behind the others when nothing is planned', () => {
    expect(nextOrder([m('a', true), m('b'), m('c')], new Map()).map((x) => x.key)).toEqual(['b', 'c', 'a']);
  });
});

describe('recentOrder', () => {
  it('lists the latest result first', () => {
    const list = [
      { id: 'early', finishedAt: '2026-11-07T10:00:00Z' },
      { id: 'none', finishedAt: null },
      { id: 'late', finishedAt: '2026-11-07T11:00:00Z' },
    ];
    expect(recentOrder(list).map((x) => x.id)).toEqual(['late', 'early', 'none']);
  });
});

describe('competitionProgress', () => {
  const match = (status: 'pending' | 'ready' | 'called' | 'finished') => ({ status }) as never;

  it('counts the matches played while the competition runs', () => {
    const progress = competitionProgress({ competition: { drawn: true }, finished: false, matches: [match('finished'), match('ready'), match('pending')] });
    expect(progress).toEqual({ stage: 'running', played: 1, total: 3 });
  });

  it('knows competitions not drawn yet and finished ones', () => {
    expect(competitionProgress({ competition: { drawn: false }, finished: false, matches: [] })).toEqual({ stage: 'notDrawn' });
    expect(competitionProgress({ competition: { drawn: true }, finished: true, matches: [] })).toEqual({ stage: 'finished' });
  });
});
