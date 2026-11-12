import { describe, expect, it } from 'vitest';
import { drawForStructure, resolveCompetition, rotationRanking, validateDraw, type Draw } from './competition.js';
import { buildStructure, validateFormat, type CompetitionFormat } from './format.js';
import { formatCapabilities, generateVariants, simulatePlan } from './planner.js';
import { createRng } from './rng.js';
import { ROTATION_MAX_ENTRIES, ROTATION_MIN_ENTRIES, rotationMatchesPerPlayer, rotationSchedule } from './rotation.js';
import { tableTennis } from './sport/tableTennis.js';
import type { MatchResult } from './standings.js';

const ranking = tableTennis.ranking;
const rotation: CompetitionFormat = { rotation: {} };
const win = (winner: 0 | 1, games = 3): MatchResult => ({
  winner,
  games: Array.from({ length: games }, (_, i) => (i < 3 ? (winner === 0 ? [11, 5] : [5, 11]) : winner === 0 ? [5, 11] : [11, 5])) as [number, number][],
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

describe('rotationSchedule', () => {
  it('lets every player partner every other player once with 4k and 4k + 1 players', () => {
    expect(rotationMatchesPerPlayer(8)).toBe(7);
    expect(rotationMatchesPerPlayer(9)).toBe(8);
    expect(rotationMatchesPerPlayer(10)).toBe(8);
    expect(rotationMatchesPerPlayer(11)).toBe(8);
    for (const n of [4, 5, 8, 9, 12, 13]) {
      const partners = new Set(rotationSchedule(n).rounds.flat().flatMap(([p, q]) => [key(...p), key(...q)]));
      expect(partners.size).toBe((n * (n - 1)) / 2);
    }
  });

  it('gives everybody the same number of matches, never the same partner twice and nobody two matches in a round', () => {
    for (let n = ROTATION_MIN_ENTRIES; n <= ROTATION_MAX_ENTRIES; n++) {
      const { rounds, matchesPerPlayer } = rotationSchedule(n);
      const games = new Array<number>(n).fill(0);
      const partners = new Set<string>();
      for (const round of rounds) {
        const players = round.flat(2);
        expect(new Set(players).size).toBe(players.length);
        for (const [p, q] of round) {
          for (const pair of [p, q]) {
            expect(partners.has(key(...pair))).toBe(false);
            partners.add(key(...pair));
          }
        }
        for (const player of players) games[player]!++;
      }
      expect(games.every((g) => g === matchesPerPlayer)).toBe(true);
      expect(matchesPerPlayer).toBe(rotationMatchesPerPlayer(n));
    }
  });

  it('spreads the opponents: with four players everybody meets everybody twice, nobody meets an opponent more than four times', () => {
    const opponents = (n: number) => {
      const count = new Map<string, number>();
      for (const [p, q] of rotationSchedule(n).rounds.flat()) {
        for (const x of p) for (const y of q) count.set(key(x, y), (count.get(key(x, y)) ?? 0) + 1);
      }
      return [...count.values()];
    };
    expect(opponents(4)).toEqual([2, 2, 2, 2, 2, 2]);
    for (let n = 5; n <= 32; n++) expect(Math.max(...opponents(n))).toBeLessThanOrEqual(4);
  });

  it('is the same on every call', () => {
    expect(JSON.stringify(rotationSchedule(10))).toBe(JSON.stringify(rotationSchedule(10)));
  });
});

describe('format', () => {
  it('stands alone and needs 4 to 32 players', () => {
    expect(validateFormat(rotation, 4)).toBeNull();
    expect(validateFormat(rotation, 3)).toBe('tooFewEntries');
    expect(validateFormat(rotation, 33)).toBe('tooManyEntries');
    expect(validateFormat({ rotation: {}, knockout: { placements: 'none' } }, 8)).toBe('conflictingStages');
  });

  it('builds the matches of every round with two seats and two partners each', () => {
    const structure = buildStructure(rotation, 6);
    expect(structure.rotation).toEqual({ rounds: 6, matchesPerPlayer: 4 });
    expect(structure.groupSizes).toEqual([6]);
    expect(structure.matchesPerEntry).toEqual({ min: 4, max: 4 });
    expect(structure.matches).toHaveLength(6);
    const [first] = structure.matches;
    expect(first).toMatchObject({ id: 'RT-1-1', phase: 'rotation', round: 1, dependsOn: [] });
    expect(first!.partners).toHaveLength(2);
    expect(formatCapabilities(rotation, 6)).toEqual({ placements: false, consolation: false, fillByes: false, swissRounds: null });
  });

  it('is offered only when asked for', () => {
    expect(generateVariants(8).some((v) => v.format.rotation)).toBe(false);
    expect(generateVariants(8, { rotation: 'include' }).at(-1)).toEqual({ id: 'rotation', format: rotation });
    expect(generateVariants(8, { rotation: 'only' })).toEqual([{ id: 'rotation', format: rotation }]);
    expect(generateVariants(3, { rotation: 'only' })).toEqual([]);
  });
});

describe('draw and table', () => {
  const structure = buildStructure(rotation, 5);
  const draw = drawForStructure(structure, ids(5).map((id) => ({ id })), createRng('x'));

  it('draws the order of the players', () => {
    expect(draw.type).toBe('rotation');
    expect(validateDraw(structure, draw)).toBeNull();
    expect(validateDraw(structure, { type: 'rotation', order: ids(4) })).toBe('wrongEntryCount');
    expect(validateDraw(structure, { type: 'groups', groups: [ids(5)] })).toBe('wrongDrawType');
  });

  it('credits a result to both players of a side and ranks the players by their own wins', () => {
    const fixed: Draw = { type: 'rotation', order: ids(5) };
    const results = new Map<string, MatchResult>();
    const start = resolveCompetition(structure, fixed, results, ranking);
    expect(start.matches.every((m) => m.status === 'ready' && m.partners?.every((p) => p !== null))).toBe(true);
    // P01 wins every match it plays, everybody else loses with each other
    const players = (m: (typeof start.matches)[number], side: 0 | 1) => [m.sides[side], m.partners![side]];
    for (const m of start.matches) results.set(m.id, win(players(m, 1).includes('P01') ? 1 : 0));
    const state = resolveCompetition(structure, fixed, results, ranking, { lotSeed: 'lots' });
    const [table] = state.groups;
    expect(table!.complete).toBe(true);
    expect(table!.standings).toHaveLength(5);
    expect(table!.standings.every((row) => row.played === 4)).toBe(true);
    expect(table!.standings[0]).toMatchObject({ entryId: 'P01', won: 4, lost: 0 });
    expect(table!.standings.reduce((sum, row) => sum + row.won, 0)).toBe(10);
    expect(state.finished).toBe(true);
    expect(state.placements[0]).toEqual({ entryId: 'P01', place: 1, placeTo: 1 });
    expect(state.placements).toHaveLength(5);
  });

  it('annuls every match of a withdrawn player for all four and ranks them last', () => {
    const fixed: Draw = { type: 'rotation', order: ids(5) };
    const results = new Map<string, MatchResult>();
    const first = resolveCompetition(structure, fixed, results, ranking).matches[0]!;
    results.set(first.id, win(0));
    const state = resolveCompetition(structure, fixed, results, ranking, { withdrawn: new Set([first.sides[0]!]) });
    const own = state.matches.filter((m) => [...m.sides, ...m.partners!].includes(first.sides[0]!));
    expect(own.slice(1).every((m) => m.withdrawal && m.status === 'finished')).toBe(true);
    const rows = state.groups[0]!.standings;
    expect(rows.at(-1)).toMatchObject({ entryId: first.sides[0], withdrawn: true });
    // The finished match counts for nobody any more
    expect(rows.find((r) => r.entryId === first.partners![0])!.played).toBe(4 - own.length);
  });

  it('ranks without head-to-head', () => {
    expect(rotationRanking(ranking)).toEqual({ criteria: ['record', 'gameDiff', 'pointDiff'], lastResort: 'lot' });
  });
});

describe('planner', () => {
  it('keeps all four players of a match off other tables and lets several matches run at once', () => {
    const plan = simulatePlan({
      competitions: [{ id: 'mix', entryCount: 8, format: rotation, matchMinutes: 20 }],
      tables: ['1', '2', '3'],
      startMin: 600,
    });
    const [forecast] = plan.competitions;
    expect(forecast).toMatchObject({ matchCount: 14, matchesPerEntry: { min: 7, max: 7 }, unscheduled: 0 });
    // Two matches per round use all eight players, so the third table stays empty: 7 rounds of 20 minutes
    expect(plan.end).toBe(600 + 7 * 20);
    for (const a of plan.matches) {
      for (const b of plan.matches) {
        if (a === b || a.start >= b.end || b.start >= a.end) continue;
        const people = (m: typeof a) => [...m.match.sides, ...m.match.partners!].map((s) => (s.type === 'rotationSeat' ? s.position : -1));
        expect(people(a).some((p) => people(b).includes(p))).toBe(false);
      }
    }
  });
});
