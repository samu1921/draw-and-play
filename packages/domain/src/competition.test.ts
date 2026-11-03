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
