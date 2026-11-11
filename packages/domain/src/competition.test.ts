import { describe, expect, it } from 'vitest';
import {
  dependentMatches,
  drawForStructure,
  resolveCompetition,
  validateDraw,
  type Draw,
} from './competition.js';
import { buildStructure, type CompetitionFormat } from './format.js';
import { createRng } from './rng.js';
import { tableTennis } from './sport/tableTennis.js';
import type { MatchResult } from './standings.js';

const ranking = tableTennis.ranking;
const win = (winner: 0 | 1): MatchResult => ({
  winner,
  games: winner === 0 ? [[11, 5], [11, 5], [11, 5]] : [[5, 11], [5, 11], [5, 11]],
});

/** Lets the side with the lexically smaller entry id win every ready match until nothing changes. */
function playAll(structure: ReturnType<typeof buildStructure>, draw: Draw, results = new Map<string, MatchResult>()) {
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of resolveCompetition(structure, draw, results, ranking).matches) {
      if (m.status !== 'ready') continue;
      const [a, b] = m.sides as [string, string];
      results.set(m.id, win(a < b ? 0 : 1));
      changed = true;
    }
  }
  return results;
}

const roundRobin: CompetitionFormat = { groups: { groupCount: 1 } };
const twoGroupsTop2: CompetitionFormat = { groups: { groupCount: 2 }, knockout: { qualifiersPerGroup: 2, placements: 'thirdPlace' } };

describe('validateDraw', () => {
  const structure = buildStructure(twoGroupsTop2, 8);

  it('accepts a draw that fits the structure', () => {
    expect(validateDraw(structure, { type: 'groups', groups: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']] })).toBeNull();
  });

  it('rejects wrong shapes and duplicates', () => {
    expect(validateDraw(structure, { type: 'knockout', seats: [] })).toBe('wrongDrawType');
    expect(validateDraw(structure, { type: 'groups', groups: [['A', 'B', 'C'], ['E', 'F', 'G', 'H']] })).toBe('wrongGroupSizes');
    expect(validateDraw(structure, { type: 'groups', groups: [['A', 'B', 'C', 'D'], ['A', 'F', 'G', 'H']] })).toBe('duplicateEntry');
  });
});

describe('drawForStructure', () => {
  const entries = Array.from({ length: 10 }, (_, i) => ({ id: `P${i + 1}`, rating: 2000 - i }));

  it('draws groups that match the structure', () => {
    const structure = buildStructure({ groups: { groupCount: 3 }, knockout: { qualifiersPerGroup: 2, placements: 'none' } }, 10);
    const draw = drawForStructure(structure, entries, createRng('x'));
    expect(validateDraw(structure, draw)).toBeNull();
    expect(draw.type === 'groups' && draw.groups.map((g) => g[0])).toEqual(['P1', 'P2', 'P3']);
  });

  it('draws a knockout with byes exactly where the structure expects them', () => {
    const structure = buildStructure({ knockout: { placements: 'none' } }, 6);
    const draw = drawForStructure(structure, entries.slice(0, 6), createRng('y'));
    expect(validateDraw(structure, draw)).toBeNull();
    if (draw.type !== 'knockout') throw new Error('expected a knockout draw');
    expect(draw.seats.map((s) => s === null)).toEqual(structure.knockout!.seats.map((s) => s === null));
    expect(draw.seats[0]).toBe('P1');
  });

  it('passes the seeding options to the group draw', () => {
    const structure = buildStructure({ groups: { groupCount: 2 } }, 8);
    const draw = drawForStructure(structure, entries.slice(0, 8), createRng('z'), { seedCount: 4 });
    expect(draw.type === 'groups' && draw.groups.map((g) => g.slice(0, 2))).toEqual([
      ['P1', 'P4'],
      ['P2', 'P3'],
    ]);
  });

  it('fixed knockout seeds keep their bracket positions', () => {
    const structure = buildStructure({ knockout: { placements: 'none' } }, 8);
    for (let seed = 0; seed < 10; seed++) {
      const draw = drawForStructure(structure, entries.slice(0, 8), createRng(seed), { seedCount: 4, seedPlacement: 'fixed' });
      if (draw.type !== 'knockout') throw new Error('expected a knockout draw');
      expect([draw.seats[0], draw.seats[3], draw.seats[4], draw.seats[7]]).toEqual(['P1', 'P4', 'P3', 'P2']);
    }
  });
});

describe('resolveCompetition', () => {
  it('round robin: matches are ready right away, standings and placements follow the results', () => {
    const structure = buildStructure(roundRobin, 4);
    const draw: Draw = { type: 'groups', groups: [['A', 'B', 'C', 'D']] };
    const before = resolveCompetition(structure, draw, new Map(), ranking);
    expect(before.matches.every((m) => m.status === 'ready')).toBe(true);
    expect(before.groups[0]!.complete).toBe(false);
    expect(before.placements).toEqual([]);

    const state = resolveCompetition(structure, draw, playAll(structure, draw), ranking);
    expect(state.finished).toBe(true);
    expect(state.groups[0]!.standings.map((r) => r.entryId)).toEqual(['A', 'B', 'C', 'D']);
    expect(state.placements.map((p) => [p.entryId, p.place])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
      ['D', 4],
    ]);
  });

  it('groups → knockout: qualifiers appear once their group is complete', () => {
    const structure = buildStructure(twoGroupsTop2, 8);
    const draw: Draw = { type: 'groups', groups: [['A1', 'A2', 'A3', 'A4'], ['B1', 'B2', 'B3', 'B4']] };
    const results = new Map<string, MatchResult>();
    // Finish group A only
    for (const m of resolveCompetition(structure, draw, results, ranking).matches) {
      if (m.status === 'ready' && m.id.startsWith('GA')) results.set(m.id, win(m.sides[0]! < m.sides[1]! ? 0 : 1));
    }
    const midway = resolveCompetition(structure, draw, results, ranking);
    expect(midway.groups.map((g) => g.complete)).toEqual([true, false]);
    const semis = midway.matches.filter((m) => m.id.startsWith('KO-r1'));
    expect(semis.map((m) => m.sides)).toEqual([
      ['A1', null],
      ['A2', null],
    ]);
    expect(semis.every((m) => m.status === 'pending')).toBe(true);
  });

  it('groups → knockout: full run gives places 1–4 from the bracket and shared places for the group stage', () => {
    const structure = buildStructure(twoGroupsTop2, 8);
    const draw: Draw = { type: 'groups', groups: [['A1', 'A2', 'A3', 'A4'], ['B1', 'B2', 'B3', 'B4']] };
    const state = resolveCompetition(structure, draw, playAll(structure, draw), ranking);
    expect(state.finished).toBe(true);
    // Semis A1–B2 and A2–B1 → A1 and A2 reach the final; the smaller id always wins
    expect(state.placements).toEqual([
      { entryId: 'A1', place: 1, placeTo: 1 },
      { entryId: 'A2', place: 2, placeTo: 2 },
      { entryId: 'B1', place: 3, placeTo: 3 },
      { entryId: 'B2', place: 4, placeTo: 4 },
      { entryId: 'A3', place: 5, placeTo: 6 },
      { entryId: 'B3', place: 5, placeTo: 6 },
      { entryId: 'A4', place: 7, placeTo: 8 },
      { entryId: 'B4', place: 7, placeTo: 8 },
    ]);
  });

  it('knockout with byes: entries with a bye already stand in their second-round match', () => {
    const structure = buildStructure({ knockout: { placements: 'none' } }, 6);
    const draw: Draw = { type: 'knockout', seats: ['S1', null, 'S5', 'S4', 'S3', 'S6', null, 'S2'] };
    const state = resolveCompetition(structure, draw, new Map(), ranking);
    const semis = state.matches.filter((m) => m.phase === 'knockout' && m.round === 2);
    expect(semis.map((m) => m.sides)).toEqual([
      ['S1', null],
      [null, 'S2'],
    ]);
    const final = resolveCompetition(structure, draw, playAll(structure, draw), ranking);
    expect(final.placements.slice(0, 2).map((p) => p.entryId)).toEqual(['S1', 'S2']);
  });

  it('withdrawal in a group: remaining matches are walkovers, all its matches are annulled, it is ranked last', () => {
    const structure = buildStructure(roundRobin, 4);
    const draw: Draw = { type: 'groups', groups: [['A', 'B', 'C', 'D']] };
    // D played one match (and lost to A) before withdrawing
    const played = resolveCompetition(structure, draw, new Map(), ranking).matches.find((m) => m.sides.includes('A') && m.sides.includes('D'))!;
    const results = new Map([[played.id, win(played.sides[0] === 'A' ? 0 : 1)]]);
    const state = resolveCompetition(structure, draw, results, ranking, { withdrawn: new Set(['D']) });

    const ofD = state.matches.filter((m) => m.sides.includes('D'));
    expect(ofD).toHaveLength(3);
    expect(ofD.filter((m) => m.withdrawal).map((m) => [m.status, m.loser, m.result?.walkover])).toEqual([
      ['finished', 'D', true],
      ['finished', 'D', true],
    ]);
    const kept = ofD.find((m) => m.id === played.id)!;
    expect([kept.loser, kept.withdrawal, kept.result?.walkover, kept.result?.games.length]).toEqual(['D', undefined, undefined, 3]);
    // The others still play each other
    expect(state.matches.filter((m) => m.status === 'ready')).toHaveLength(3);
    // DTTB WO D 7.9: the played match against D is annulled as well, D is last
    const standings = state.groups[0]!.standings;
    expect(standings.at(-1)).toMatchObject({ entryId: 'D', rank: 4, played: 0, withdrawn: true });
    expect(standings.find((r) => r.entryId === 'A')).toMatchObject({ played: 0, won: 0 });
  });

  it('not turning up to a group match counts as withdrawing: the same as a withdrawal', () => {
    const structure = buildStructure(roundRobin, 4);
    const draw: Draw = { type: 'groups', groups: [['A', 'B', 'C', 'D']] };
    const open = resolveCompetition(structure, draw, new Map(), ranking).matches;
    const bc = open.find((m) => m.sides.includes('B') && m.sides.includes('C'))!;
    const ab = open.find((m) => m.sides.includes('A') && m.sides.includes('B'))!;
    // B beat C, then did not turn up against A
    const results = new Map([
      [bc.id, win(bc.sides[0] === 'B' ? 0 : 1)],
      [ab.id, { winner: ab.sides[0] === 'A' ? 0 : 1, games: [], walkover: true } as MatchResult],
    ]);
    const state = resolveCompetition(structure, draw, results, ranking);
    expect(state.matches.filter((m) => m.sides.includes('B') && m.withdrawal)).toHaveLength(1);
    const standings = state.groups[0]!.standings;
    expect(standings.at(-1)).toMatchObject({ entryId: 'B', withdrawn: true });
    expect(standings.find((r) => r.entryId === 'C')).toMatchObject({ played: 0, lost: 0 });
  });

  it('draws lots in a finished group when entries are level on everything, not while it runs', () => {
    const structure = buildStructure(roundRobin, 3);
    const draw: Draw = { type: 'groups', groups: [['A', 'B', 'C']] };
    const standings = (results: Map<string, MatchResult>, lotSeed: number) =>
      resolveCompetition(structure, draw, results, ranking, { lotSeed }).groups[0]!.standings.map((r) => r.entryId).join();
    // Before any result: the draw order, whatever the seed
    expect(new Set(Array.from({ length: 12 }, (_, seed) => standings(new Map(), seed)))).toEqual(new Set(['A,B,C']));
    // Cyclic with identical scores: level on everything once finished
    const results = new Map<string, MatchResult>();
    for (const m of resolveCompetition(structure, draw, results, ranking).matches) {
      const [a, b] = m.sides as [string, string];
      const winnerIsFirst = (a === 'A' && b === 'B') || (a === 'B' && b === 'C') || (a === 'C' && b === 'A');
      results.set(m.id, win(winnerIsFirst ? 0 : 1));
    }
    expect(new Set(Array.from({ length: 12 }, (_, seed) => standings(results, seed))).size).toBeGreaterThan(1);
  });

  it('withdrawal in the knockout: every later opponent goes through without playing', () => {
    const structure = buildStructure({ knockout: { placements: 'thirdPlace' } }, 4);
    const draw: Draw = { type: 'knockout', seats: ['S1', 'S4', 'S3', 'S2'] };
    const withdrawn = new Set(['S4']);
    const semi = resolveCompetition(structure, draw, new Map(), ranking, { withdrawn }).matches.filter((m) => m.round === 1);
    expect(semi.map((m) => [m.status, m.winner ?? null])).toEqual([
      ['finished', 'S1'],
      ['ready', null],
    ]);

    // S4 has to play the match for third place as well: walkover for the other semifinal loser
    const results = new Map([[semi[1]!.id, win(1)]]);
    const state = resolveCompetition(structure, draw, results, ranking, { withdrawn });
    const third = state.matches.find((m) => m.phase === 'knockout' && m.sides.includes('S4') && m.round === 2)!;
    expect(third).toMatchObject({ status: 'finished', winner: 'S3', withdrawal: true });
    expect(state.matches.find((m) => m.sides.includes('S1') && m.sides.includes('S2'))!.status).toBe('ready');
  });

  it('withdrawal of both sides: the first side goes through, so the bracket stays resolvable', () => {
    const structure = buildStructure({ knockout: { placements: 'none' } }, 4);
    const draw: Draw = { type: 'knockout', seats: ['S1', 'S4', 'S3', 'S2'] };
    const state = resolveCompetition(structure, draw, new Map(), ranking, { withdrawn: new Set(['S1', 'S4']) });
    const first = state.matches.find((m) => m.sides.includes('S1'))!;
    expect(first).toMatchObject({ status: 'finished', winner: 'S1', withdrawal: true });
    // and S1 then loses the final by walkover once the other semifinal is decided
    const results = new Map([[state.matches.find((m) => m.sides.includes('S2'))!.id, win(1)]]);
    const final = resolveCompetition(structure, draw, results, ranking, { withdrawn: new Set(['S1', 'S4']) }).matches.find((m) => m.round === 2)!;
    expect(final).toMatchObject({ status: 'finished', winner: 'S2', withdrawal: true });
  });

  it('ignores results for matches whose sides are not known yet', () => {
    const structure = buildStructure(twoGroupsTop2, 8);
    const draw: Draw = { type: 'groups', groups: [['A1', 'A2', 'A3', 'A4'], ['B1', 'B2', 'B3', 'B4']] };
    const semi = structure.matches.find((m) => m.phase === 'knockout')!.id;
    const state = resolveCompetition(structure, draw, new Map([[semi, win(0)]]), ranking);
    expect(state.matches.find((m) => m.id === semi)!.status).toBe('pending');
  });
});

describe('dependentMatches', () => {
  it('lists every match that builds on a result, transitively', () => {
    const structure = buildStructure(twoGroupsTop2, 8);
    const groupMatch = structure.matches.find((m) => m.phase === 'group')!.id;
    const knockoutIds = structure.matches.filter((m) => m.phase === 'knockout').map((m) => m.id);
    expect([...dependentMatches(structure, groupMatch)].sort()).toEqual([...knockoutIds].sort());
    const final = structure.matches.find((m) => m.bracketMatch?.places[0] === 1 && m.bracketMatch.places[1] === 2)!;
    expect(dependentMatches(structure, final.id)).toEqual([]);
  });
});
