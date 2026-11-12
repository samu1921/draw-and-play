import { describe, expect, it } from 'vitest';
import { dependentMatches, drawForStructure, resolveCompetition, syncSwissRounds, validateDraw, type Draw } from './competition.js';
import { buildStructure, validateFormat, type CompetitionFormat } from './format.js';
import { createRng } from './rng.js';
import { tableTennis } from './sport/tableTennis.js';
import type { MatchResult } from './standings.js';
import { pairSwissRound, swissRoundRange, swissStandings } from './swiss.js';

const ranking = tableTennis.ranking;
const swissRanking = tableTennis.swissRanking;
const win = (winner: 0 | 1): MatchResult => ({
  winner,
  games: winner === 0 ? [[11, 5], [11, 5], [11, 5]] : [[5, 11], [5, 11], [5, 11]],
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
const entries = (n: number) => ids(n).map((id, i) => ({ id, rating: 2000 - i * 10 }));
const swiss = (rounds: number): CompetitionFormat => ({ swiss: { rounds } });

type Structure = ReturnType<typeof buildStructure>;
interface Options {
  withdrawn?: Set<string>;
  /** Called after every finished round */
  afterRound?: (round: number, draw: Draw) => void;
}

/** Plays a Swiss system to the end; the entry with the smaller id (the better rating) wins every match. */
function play(structure: Structure, start: Draw, options: Options = {}) {
  const results = new Map<string, MatchResult>();
  let draw = start;
  const resolve = () => resolveCompetition(structure, draw, results, ranking, { swissRanking, lotSeed: 'lots', ...(options.withdrawn && { withdrawn: options.withdrawn }) });
  for (let guard = 0; guard < 100; guard++) {
    const ready = resolve().matches.filter((m) => m.status === 'ready');
    for (const m of ready) {
      const [a, b] = m.sides as [string, string];
      results.set(m.id, win(a < b ? 0 : 1));
    }
    const round = draw.type === 'swiss' ? draw.rounds.length : 0;
    if (ready.some((m) => m.phase === 'swiss')) options.afterRound?.(round, draw);
    const next = syncSwissRounds(structure, draw, results, ranking, { swissRanking, lotSeed: 'lots', ...(options.withdrawn && { withdrawn: options.withdrawn }) });
    if (next === draw && ready.length === 0) break;
    draw = next;
  }
  return { draw, results, state: resolve() };
}

describe('swissRoundRange', () => {
  it('needs at least the rounds of a knockout and recommends two more', () => {
    expect(swissRoundRange(16)).toEqual({ min: 4, recommended: 6, max: 15 });
    expect(swissRoundRange(9)).toEqual({ min: 4, recommended: 6, max: 9 });
    expect(swissRoundRange(4)).toEqual({ min: 2, recommended: 3, max: 3 });
    expect(swissRoundRange(2)).toEqual({ min: 1, recommended: 1, max: 1 });
  });
});

describe('validateFormat', () => {
  it('checks the rounds of a Swiss system', () => {
    expect(validateFormat(swiss(5), 12)).toBeNull();
    expect(validateFormat(swiss(0), 12)).toBe('invalidRounds');
    expect(validateFormat(swiss(12), 12)).toBe('invalidRounds');
    expect(validateFormat({ swiss: { rounds: 3 }, groups: { groupCount: 2 } }, 12)).toBe('conflictingStages');
  });

  it('needs a number of qualifiers for a knockout after the Swiss rounds', () => {
    expect(validateFormat({ swiss: { rounds: 4 }, knockout: { placements: 'none' } }, 12)).toBe('missingQualifiers');
    expect(validateFormat({ swiss: { rounds: 4 }, knockout: { qualifiersPerGroup: 4, placements: 'none' } }, 12)).toBeNull();
  });
});

describe('pairSwissRound', () => {
  const noWins = new Map<string, number>();

  it('pairs the upper half against the lower half in round 1', () => {
    expect(pairSwissRound({ ranked: ids(8), wins: noWins, previous: [] })).toEqual({
      pairs: [['P01', 'P05'], ['P02', 'P06'], ['P03', 'P07'], ['P04', 'P08']],
    });
  });

  it('gives the bye to the lowest entry', () => {
    const round = pairSwissRound({ ranked: ids(5), wins: noWins, previous: [] });
    expect(round.bye).toBe('P05');
    expect(round.pairs).toEqual([['P01', 'P03'], ['P02', 'P04']]);
  });

  it('pairs entries with the same number of wins', () => {
    const wins = new Map([['P01', 1], ['P02', 1], ['P03', 1], ['P04', 1], ['P05', 0], ['P06', 0], ['P07', 0], ['P08', 0]]);
    const previous = [{ pairs: [['P01', 'P05'], ['P02', 'P06'], ['P03', 'P07'], ['P04', 'P08']] as [string, string][] }];
    expect(pairSwissRound({ ranked: ids(8), wins, previous }).pairs).toEqual([['P01', 'P03'], ['P02', 'P04'], ['P05', 'P07'], ['P06', 'P08']]);
  });

  it('lets the odd one play down and avoids repeats', () => {
    const wins = new Map([['P01', 2], ['P02', 1], ['P03', 1], ['P04', 0]]);
    const previous = [{ pairs: [['P01', 'P02'], ['P03', 'P04']] as [string, string][] }];
    // P01 has already played P02, so it meets P03
    expect(pairSwissRound({ ranked: ids(4), wins, previous }).pairs).toEqual([['P01', 'P03'], ['P02', 'P04']]);
  });

  it('does not give the bye to the same entry twice', () => {
    const previous = [{ pairs: [['P01', 'P03'], ['P02', 'P04']] as [string, string][], bye: 'P05' }];
    const round = pairSwissRound({ ranked: ids(5), wins: new Map([['P05', 1]]), previous, freeWins: new Map([['P05', 1]]) });
    expect(round.bye).toBe('P04');
  });

  it('repeats a pairing only when nothing else is left', () => {
    const previous = [{ pairs: [['P01', 'P02']] as [string, string][] }];
    expect(pairSwissRound({ ranked: ids(2), wins: noWins, previous }).pairs).toEqual([['P01', 'P02']]);
  });
});

describe('swissStandings', () => {
  it('counts a bye as a win and with the wins of the last entry in the Buchholz score', () => {
    const { rows } = swissStandings(
      ['A', 'B', 'C'],
      [
        { matches: [{ a: 'A', b: 'B', result: win(0) }], bye: 'C' },
        { matches: [{ a: 'A', b: 'C', result: win(0) }], bye: 'B' },
      ],
      swissRanking,
    );
    expect(rows.map((r) => [r.entryId, r.won, r.buchholz])).toEqual([
      // A beat B and C (one win each); B and C each lost to A (2) and had a bye (worth the fewest wins: 1)
      ['A', 2, 2],
      ['B', 1, 3],
      ['C', 1, 3],
    ]);
    expect(rows.every((r) => r.played === 2)).toBe(true);
  });

  it('orders by wins, then Buchholz, then the match between the level entries', () => {
    // A and B both 2:1 with the same Buchholz; B beat A
    const { rows, tieBreaks } = swissStandings(
      ['A', 'B', 'C', 'D'],
      [
        { matches: [{ a: 'A', b: 'B', result: win(1) }, { a: 'C', b: 'D', result: win(0) }] },
        { matches: [{ a: 'A', b: 'C', result: win(0) }, { a: 'B', b: 'D', result: win(1) }] },
        { matches: [{ a: 'A', b: 'D', result: win(0) }, { a: 'B', b: 'C', result: win(0) }] },
      ],
      swissRanking,
    );
    expect(rows.map((r) => r.entryId)).toEqual(['B', 'A', 'C', 'D']);
    expect(tieBreaks[0]!.steps.map((s) => s.type)).toEqual(['criterion', 'headToHead', 'criterion']);
  });
});

describe('a Swiss competition', () => {
  it('has a match per board and round, each round waiting for the one before', () => {
    const structure = buildStructure(swiss(3), 9);
    expect(structure.swiss).toEqual({ rounds: 3, boards: 4 });
    expect(structure.matches.map((m) => m.id)).toHaveLength(12);
    expect(structure.matches.find((m) => m.id === 'SW-2-1')!.dependsOn).toEqual(['SW-1-1', 'SW-1-2', 'SW-1-3', 'SW-1-4']);
    expect(structure.matchesPerEntry).toEqual({ min: 2, max: 3 });
    expect(dependentMatches(structure, 'SW-1-1')).toHaveLength(8);
  });

  it('draws the seeds into the upper half and pairs round 1', () => {
    const structure = buildStructure(swiss(4), 8);
    const draw = drawForStructure(structure, entries(8), createRng('s'));
    expect(validateDraw(structure, draw)).toBeNull();
    if (draw.type !== 'swiss') throw new Error('expected a Swiss draw');
    expect(draw.order.slice(0, 4)).toEqual(['P01', 'P02', 'P03', 'P04']);
    expect([...draw.order.slice(4)].sort()).toEqual(['P05', 'P06', 'P07', 'P08']);
    expect(draw.rounds).toHaveLength(1);
    expect(draw.rounds[0]!.pairs.map(([a]) => a)).toEqual(['P01', 'P02', 'P03', 'P04']);
  });

  it('pairs the next round only when the round before is finished', () => {
    const structure = buildStructure(swiss(3), 8);
    const draw = drawForStructure(structure, entries(8), createRng('s'));
    const results = new Map<string, MatchResult>([['SW-1-1', win(0)]]);
    expect(syncSwissRounds(structure, draw, results, ranking)).toBe(draw);
    const state = resolveCompetition(structure, draw, results, ranking);
    expect(state.matches.filter((m) => m.round === 2).every((m) => m.status === 'pending')).toBe(true);
  });

  it('plays all rounds without repeating a pairing and ranks everybody', () => {
    const structure = buildStructure(swiss(5), 16);
    const { draw, state } = play(structure, drawForStructure(structure, entries(16), createRng('s')));
    if (draw.type !== 'swiss') throw new Error('expected a Swiss draw');
    expect(draw.rounds).toHaveLength(5);
    const pairings = draw.rounds.flatMap((r) => r.pairs.map((p) => [...p].sort().join('-')));
    expect(new Set(pairings).size).toBe(pairings.length);
    expect(state.finished).toBe(true);
    expect(state.groups[0]!.complete).toBe(true);
    // The strongest always wins here, so it ends on five wins and first
    expect(state.groups[0]!.standings[0]).toMatchObject({ entryId: 'P01', won: 5, lost: 0 });
    expect(state.placements.map((p) => p.place)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(state.placements[0]!.entryId).toBe('P01');
  });

  it('gives a different entry the bye in every round', () => {
    const structure = buildStructure(swiss(4), 7);
    const { draw, state } = play(structure, drawForStructure(structure, entries(7), createRng('s')));
    if (draw.type !== 'swiss') throw new Error('expected a Swiss draw');
    const byes = draw.rounds.map((r) => r.bye);
    expect(byes.every((b) => b !== undefined)).toBe(true);
    expect(new Set(byes).size).toBe(4);
    expect(state.groups[0]!.standings.every((r) => r.played === 4)).toBe(true);
  });

  it('keeps the pairings of a round that has started', () => {
    const structure = buildStructure(swiss(3), 8);
    const draw = drawForStructure(structure, entries(8), createRng('s'));
    const withdrawn = new Set(['P08']);
    // Nothing has started: the withdrawn entry is left out and someone gets a bye
    const repaired = syncSwissRounds(structure, draw, new Map(), ranking, { withdrawn });
    if (repaired.type !== 'swiss') throw new Error('expected a Swiss draw');
    expect(repaired.rounds[0]!.pairs.flat()).not.toContain('P08');
    expect(repaired.rounds[0]!.bye).toBeDefined();
    // A match of the round is on a table: the pairings stay, the opponent wins by walkover
    const kept = syncSwissRounds(structure, draw, new Map(), ranking, { withdrawn, started: new Set(['SW-1-1']) });
    expect(kept).toBe(draw);
    const state = resolveCompetition(structure, draw, new Map(), ranking, { withdrawn });
    expect(state.matches.find((m) => m.sides.includes('P08'))).toMatchObject({ status: 'finished', withdrawal: true });
  });

  it('keeps a withdrawn entry in the table with a loss for every further round', () => {
    const structure = buildStructure(swiss(3), 16);
    const withdrawn = new Set<string>();
    const { draw, state } = play(structure, drawForStructure(structure, entries(16), createRng('s')), {
      withdrawn,
      afterRound: (round) => {
        if (round === 1) withdrawn.add('P01');
      },
    });
    if (draw.type !== 'swiss') throw new Error('expected a Swiss draw');
    expect(draw.rounds.slice(1).every((r) => !r.pairs.flat().includes('P01') && r.bye !== undefined)).toBe(true);
    const standings = state.groups[0]!.standings;
    const row = standings.find((r) => r.entryId === 'P01')!;
    expect(row).toMatchObject({ won: 1, lost: 2, played: 3, withdrawn: true });
    // It is not moved to the bottom: entries without a win stay behind it
    expect(standings.at(-1)!.won).toBe(0);
    expect(row.rank).toBeLessThan(16);
    // Rounds after the withdrawal have one board less, and the unused ones are not part of the state
    expect(state.matches).toHaveLength(8 + 2 * 7);
    expect(state.finished).toBe(true);
  });

  it('pairs a round again when a result of the round before is corrected', () => {
    const structure = buildStructure(swiss(3), 4);
    const start = drawForStructure(structure, entries(4), createRng('s'));
    const results = new Map<string, MatchResult>([['SW-1-1', win(0)], ['SW-1-2', win(0)]]);
    const second = syncSwissRounds(structure, start, results, ranking);
    if (second.type !== 'swiss') throw new Error('expected a Swiss draw');
    expect(second.rounds).toHaveLength(2);
    results.set('SW-1-1', win(1));
    const corrected = syncSwissRounds(structure, second, results, ranking);
    if (corrected.type !== 'swiss') throw new Error('expected a Swiss draw');
    expect(corrected.rounds[1]).not.toEqual(second.rounds[1]);
  });

  it('sends the top of the table into a knockout', () => {
    const format: CompetitionFormat = { swiss: { rounds: 3 }, knockout: { qualifiersPerGroup: 4, placements: 'thirdPlace' } };
    const structure = buildStructure(format, 8);
    expect(structure.knockout!.seats.every((s) => s?.type === 'qualifier' && s.group === 0)).toBe(true);
    expect(structure.matches.find((m) => m.id === 'KO-r1p1m1')!.dependsOn).toEqual(['SW-3-1', 'SW-3-2', 'SW-3-3', 'SW-3-4']);
    const { state } = play(structure, drawForStructure(structure, entries(8), createRng('s')));
    expect(state.finished).toBe(true);
    expect(state.placements.slice(0, 4).map((p) => p.place)).toEqual([1, 2, 3, 4]);
    expect(state.placements[0]!.entryId).toBe('P01');
    // Those who missed the knockout keep their place in the table
    expect(state.placements.slice(4).map((p) => p.place)).toEqual([5, 6, 7, 8]);
  });
});
