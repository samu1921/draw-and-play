import { describe, expect, it } from 'vitest';
import { meetingRound } from './bracket.js';
import { groupStagePlaces, resolveCompetition, type Draw } from './competition.js';
import { bestNextCount, buildStructure, validateFormat, type CompetitionFormat, type ConsolationMode } from './format.js';
import { applyFormatSettings, formatCapabilities, generateVariants } from './planner.js';
import { tableTennis } from './sport/tableTennis.js';
import type { MatchResult, StandingsRow } from './standings.js';
import { assignBestNext, rankAcrossGroups } from './transition.js';

const ranking = tableTennis.ranking;
const win = (winner: 0 | 1): MatchResult => ({
  winner,
  games: winner === 0 ? [[11, 5], [11, 5], [11, 5]] : [[5, 11], [5, 11], [5, 11]],
});

/** Won in four games instead of three */
const close = (winner: 0 | 1): MatchResult => ({
  winner,
  games: winner === 0 ? [[11, 5], [5, 11], [11, 5], [11, 5]] : [[5, 11], [11, 5], [5, 11], [5, 11]],
});

type Structure = ReturnType<typeof buildStructure>;

/** Lets the side with the lexically smaller entry id win every ready match until nothing changes. */
function playAll(structure: Structure, draw: Draw, score: (winner: 0 | 1, a: string, b: string) => MatchResult = win) {
  const results = new Map<string, MatchResult>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of resolveCompetition(structure, draw, results, ranking, { lotSeed: 'lots' }).matches) {
      if (m.status !== 'ready') continue;
      const [a, b] = m.sides as [string, string];
      results.set(m.id, score(a < b ? 0 : 1, a, b));
      changed = true;
    }
  }
  return resolveCompetition(structure, draw, results, ranking, { lotSeed: 'lots' });
}

/** Groups A, B, C, … with entries A1 (strongest) to A4 */
const groupsDraw = (sizes: number[]): Draw => ({
  type: 'groups',
  groups: sizes.map((size, g) => Array.from({ length: size }, (_, i) => `${String.fromCharCode(65 + g)}${i + 1}`)),
});

const format = (groupCount: number, k: number, extra: { fillByes?: boolean; consolation?: ConsolationMode; placements?: 'none' | 'all' } = {}): CompetitionFormat => ({
  groups: { groupCount },
  knockout: {
    qualifiersPerGroup: k,
    placements: extra.placements ?? 'none',
    ...(extra.fillByes && { fillByes: true }),
    ...(extra.consolation && { consolation: extra.consolation }),
  },
});

const row = (entryId: string, played: number, won: number, gameDiff: number, withdrawn = false): StandingsRow => ({
  entryId,
  rank: 3,
  played,
  won,
  lost: played - won,
  matchPoints: won,
  gamesWon: Math.max(0, gameDiff) + 5,
  gamesLost: Math.max(0, -gameDiff) + 5,
  pointsWon: 100,
  pointsLost: 100,
  ...(withdrawn && { withdrawn: true as const }),
});

describe('filling the bracket with the best of the next group rank', () => {
  it('counts how many advance', () => {
    expect(bestNextCount(format(3, 2, { fillByes: true }))).toBe(2);
    expect(bestNextCount(format(6, 2, { fillByes: true }))).toBe(4);
    expect(bestNextCount(format(4, 2, { fillByes: true }))).toBe(0);
    expect(bestNextCount(format(3, 2))).toBe(0);
  });

  it('needs enough groups with a next rank', () => {
    expect(validateFormat(format(3, 2, { fillByes: true }), 12)).toBeNull();
    // 10 qualifiers would need 6 thirds, but there are only 5 groups
    expect(validateFormat(format(5, 2, { fillByes: true }), 20)).toBe('cannotFillByes');
    // Groups of 3/3/2: only two of them have a third-placed entry, which is just enough
    expect(validateFormat(format(3, 2, { fillByes: true }), 8)).toBeNull();
    expect(validateFormat(format(3, 2, { fillByes: true }), 7)).toBe('cannotFillByes');
  });

  it('leaves no byes and waits for all groups', () => {
    const structure = buildStructure(format(3, 2, { fillByes: true }), 12);
    const { seats, byes } = structure.knockout!;
    expect(byes).toBe(0);
    expect(seats.filter((s) => s?.type === 'qualifier')).toHaveLength(6);
    expect(seats.flatMap((s) => (s?.type === 'bestNext' ? [s.index] : [])).sort()).toEqual([0, 1]);
    const first = structure.matches.filter((m) => m.phase === 'knockout' && m.round === 1);
    expect(first).toHaveLength(4);
    const withBest = first.find((m) => m.sides.some((s) => s.type === 'bestNext'))!;
    expect(withBest.dependsOn).toHaveLength(18);
    expect(groupStagePlaces(structure)).toEqual([
      { rank: 3, groups: [0, 1, 2], advancing: 2, place: 9, placeTo: 9 },
      { rank: 4, groups: [0, 1, 2], advancing: 0, place: 10, placeTo: 12 },
    ]);
  });

  it('compares the rank across groups of different sizes by ratios', () => {
    const ranked = rankAcrossGroups([
      { group: 0, row: row('A3', 4, 2, 1) }, // 50 % in a group of 5
      { group: 1, row: row('B3', 3, 2, -1) }, // 67 % in a group of 4
      { group: 2, row: row('C3', 3, 1, 3) }, // 33 %
      { group: 3, row: row('D3', 3, 3, 9, true) }, // withdrew: last
    ]);
    expect(ranked.map((r) => r.row.entryId)).toEqual(['B3', 'A3', 'C3', 'D3']);
  });

  it('lets lots decide between entries that are level', () => {
    const rows = [
      { group: 0, row: row('A3', 3, 1, 0) },
      { group: 1, row: row('B3', 3, 1, 0) },
    ];
    expect(rankAcrossGroups(rows).map((r) => r.group)).toEqual([0, 1]);
    expect(rankAcrossGroups(rows, (group) => -group).map((r) => r.group)).toEqual([1, 0]);
  });

  it('seats those that advance away from their own group', () => {
    // Positions 6 and 7 are open; group 0 sits at 0 and 5, group 1 at 2 and 7 … the entry of group 0 avoids position 4
    const seated = new Map([[0, [0, 5]], [1, [3, 6]]]);
    expect(assignBestNext([0, 1], [4, 7], seated)).toEqual([1, 0]);
    expect(assignBestNext([1, 0], [4, 7], seated)).toEqual([0, 1]);
  });

  it('plays the knockout with the two best thirds', () => {
    const structure = buildStructure(format(3, 2, { fillByes: true }), 12);
    const draw = groupsDraw([4, 4, 4]);
    const state = playAll(structure, draw);
    expect(state.finished).toBe(true);
    expect(state.nextRanked).toMatchObject({ rank: 3, advancing: 2, complete: true });
    expect(state.nextRanked!.rows.map((r) => r.row.entryId).sort()).toEqual(['A3', 'B3', 'C3']);
    const advancing = state.nextRanked!.rows.slice(0, 2).map((r) => r.row.entryId);
    const firstRound = state.matches.filter((m) => m.phase === 'knockout' && m.round === 1);
    expect(firstRound.flatMap((m) => m.sides).filter((id) => id!.endsWith('3')).sort()).toEqual([...advancing].sort());
    // Nobody meets an entry of the own group in the first round
    expect(firstRound.every((m) => m.sides[0]![0] !== m.sides[1]![0])).toBe(true);
    // The third that stays behind is 9th, the fourths share 10th–12th
    const out = state.nextRanked!.rows[2]!.row.entryId;
    expect(state.placements.find((p) => p.entryId === out)).toMatchObject({ place: 9, placeTo: 9 });
    expect(state.placements.filter((p) => p.place === 10).map((p) => p.entryId).sort()).toEqual(['A4', 'B4', 'C4']);
    expect(state.placements).toHaveLength(12);
  });

  it('leaves out the matches against the bottom of a larger group', () => {
    const structure = buildStructure(format(3, 2, { fillByes: true }), 13);
    const state = playAll(structure, groupsDraw([5, 4, 4]));
    // A3 beat A4 and A5 in the group, but only the win against A4 counts, as for B3 and C3
    expect(state.groups[0]!.standings[2]).toMatchObject({ entryId: 'A3', played: 4, won: 2 });
    expect(state.nextRanked).toMatchObject({ comparedSize: 4, complete: true });
    for (const { row } of state.nextRanked!.rows) expect(row).toMatchObject({ rank: 3, played: 3, won: 1, lost: 2, gamesWon: 3, gamesLost: 6 });
    expect(state.finished).toBe(true);
    expect(state.placements).toHaveLength(13);
  });

  it('counts every match when the groups have the same size', () => {
    const state = playAll(buildStructure(format(3, 2, { fillByes: true }), 12), groupsDraw([4, 4, 4]));
    expect(state.nextRanked!.comparedSize).toBeUndefined();
    expect(state.nextRanked!.rows.every((r) => r.row.played === 3)).toBe(true);
  });

  it('shows the comparison while the groups are still running', () => {
    const structure = buildStructure(format(3, 2, { fillByes: true }), 12);
    const state = resolveCompetition(structure, groupsDraw([4, 4, 4]), new Map(), ranking);
    expect(state.nextRanked).toMatchObject({ complete: false });
    expect(state.matches.filter((m) => m.phase === 'knockout').every((m) => m.status === 'pending')).toBe(true);
  });
});

describe('playing on after the group stage', () => {
  const places = (state: ReturnType<typeof playAll>) => state.placements.map((p) => [p.place, p.placeTo]);
  const unique = (n: number) => Array.from({ length: n }, (_, i) => [i + 1, i + 1]);

  it('puts everybody who is out into one consolation bracket', () => {
    const structure = buildStructure(format(3, 2, { consolation: 'bracket', placements: 'all' }), 12);
    const [bracket] = structure.consolation!.brackets;
    expect(structure.consolation!.brackets).toHaveLength(1);
    expect(bracket).toMatchObject({ id: 'C1', byes: 2 });
    expect(bracket!.bracket.placeOffset).toBe(6);
    // The thirds are seeded ahead of the fourths; the two byes go to the best of them, whatever their group
    expect(bracket!.seeded).toBe(true);
    const byeOpponents = [0, 2, 4, 6].flatMap((i) => (bracket!.seats[i] === null ? [bracket!.seats[i + 1]] : bracket!.seats[i + 1] === null ? [bracket!.seats[i]] : []));
    expect(byeOpponents).toEqual(expect.arrayContaining([{ type: 'bestNext', rank: 3, index: 0 }, { type: 'bestNext', rank: 3, index: 1 }]));
    expect(byeOpponents).toHaveLength(2);
    const first = structure.matches.filter((m) => m.stage === 'C1' && m.round === 1);
    expect(first).toHaveLength(2);
    // Shown without the places the byes leave empty
    expect(first[0]!.places).toEqual([7, 12]);
    expect(first[0]!.id.startsWith('C1-')).toBe(true);
    expect(groupStagePlaces(structure)).toEqual([]);
    // Everybody plays on after the three group matches
    expect(structure.matchesPerEntry.min).toBe(5);

    const state = playAll(structure, groupsDraw([4, 4, 4]));
    expect(state.finished).toBe(true);
    expect(places(state)).toEqual(unique(12));
    // Main bracket first: no eliminated entry ends up ahead of a qualifier
    expect(state.placements.slice(0, 6).every((p) => ['1', '2'].includes(p.entryId[1]!))).toBe(true);
  });

  it('gives the byes of the consolation bracket to the best of a rank and keeps groups apart', () => {
    const structure = buildStructure(format(3, 2, { consolation: 'bracket', placements: 'all' }), 12);
    // Group B plays closer matches, so B3 is the best third; A3 and C3 are level and separated by lot
    const state = playAll(structure, groupsDraw([4, 4, 4]), (winner, a) => (a.startsWith('B') ? close(winner) : win(winner)));
    expect(state.nextRanked).toBeUndefined();
    expect(state.seeding.map((c) => [c.rank, c.advancing, c.complete])).toEqual([[3, 0, true], [4, 0, true]]);
    expect(state.seeding[0]!.rows[0]!.row.entryId).toBe('B3');
    const first = state.matches.filter((m) => m.id.startsWith('C1-r1'));
    expect(first).toHaveLength(2);
    const playing = first.flatMap((m) => m.sides as string[]);
    // The two best thirds sit out the first round, the third one plays
    const [best, second, last] = state.seeding[0]!.rows.map((r) => r.row.entryId);
    expect(playing).not.toContain(best);
    expect(playing).not.toContain(second);
    expect(playing).toContain(last);
    // Nobody meets the entry of the own group again right away
    expect(first.every((m) => m.sides[0]![0] !== m.sides[1]![0])).toBe(true);
    expect(places(state)).toEqual(unique(12));
  });

  it('keeps the order of the groups where no bye has to be given', () => {
    // 4 thirds, 4 fourths and 4 fifths in a bracket of 16: exactly the thirds get the byes
    const structure = buildStructure(format(4, 2, { consolation: 'bracket' }), 20);
    expect(structure.consolation!.brackets[0]!.seeded).toBeUndefined();
    expect(structure.consolation!.brackets[0]!.seats.every((s) => s === null || s.type === 'qualifier')).toBe(true);
    expect(resolveCompetition(structure, groupsDraw([5, 5, 5, 5]), new Map(), ranking).seeding).toEqual([]);
  });

  it('lets a field of three play everybody against everybody', () => {
    const structure = buildStructure(format(3, 2, { consolation: 'perRank', placements: 'all' }), 12);
    expect(structure.consolation!.brackets).toEqual([]);
    expect(structure.consolation!.groups.map((g) => [g.id, g.placeOffset, g.seats.length])).toEqual([['C1', 6, 3], ['C2', 9, 3]]);
    const field = structure.matches.filter((m) => m.stage === 'C1');
    expect(field.map((m) => [m.id, m.phase, m.places])).toEqual([
      ['C1-1-1', 'placement', [7, 9]],
      ['C1-2-1', 'placement', [7, 9]],
      ['C1-3-1', 'placement', [7, 9]],
    ]);
    // Three group matches, then two in the field
    expect(structure.matchesPerEntry.min).toBe(5);

    const open = resolveCompetition(structure, groupsDraw([4, 4, 4]), new Map(), ranking);
    expect(open.placementGroups.map((g) => [g.stage, g.places, g.entries, g.complete])).toEqual([['C1', [7, 9], [], false], ['C2', [10, 12], [], false]]);

    const state = playAll(structure, groupsDraw([4, 4, 4]));
    expect(state.finished).toBe(true);
    expect(state.placementGroups[0]!.standings.map((r) => [r.entryId, r.won])).toEqual([['A3', 2], ['B3', 1], ['C3', 0]]);
    expect(places(state)).toEqual(unique(12));
    expect(state.placements.slice(6).map((p) => p.entryId)).toEqual(['A3', 'B3', 'C3', 'A4', 'B4', 'C4']);
  });

  it('annuls the matches of who withdraws from a field of three', () => {
    const structure = buildStructure(format(3, 2, { consolation: 'perRank' }), 12);
    const draw = groupsDraw([4, 4, 4]);
    const results = new Map<string, MatchResult>();
    for (const m of resolveCompetition(structure, draw, results, ranking).matches) {
      if (m.phase === 'group') results.set(m.id, win(m.sides[0]! < m.sides[1]! ? 0 : 1));
    }
    const walkover = resolveCompetition(structure, draw, results, ranking).matches.find((m) => m.id.startsWith('C1-') && m.sides.includes('A3'))!;
    results.set(walkover.id, { winner: walkover.sides[0] === 'A3' ? 1 : 0, games: [], walkover: true });
    const state = resolveCompetition(structure, draw, results, ranking);
    const field = state.placementGroups[0]!;
    // A3 did not turn up: its other match is a walkover too, and only B3 against C3 is left to play
    expect(state.matches.filter((m) => m.id.startsWith('C1-') && m.status === 'ready').map((m) => [...m.sides].sort())).toEqual([['B3', 'C3']]);
    expect(field.standings.at(-1)).toMatchObject({ entryId: 'A3', withdrawn: true, played: 0 });
    expect(field.complete).toBe(false);
  });

  it('shares the places that are not played out in the consolation bracket', () => {
    const structure = buildStructure(format(4, 2, { consolation: 'bracket' }), 16);
    const state = playAll(structure, groupsDraw([4, 4, 4, 4]));
    expect(places(state).slice(8)).toEqual([[9, 9], [10, 10], [11, 12], [11, 12], [13, 16], [13, 16], [13, 16], [13, 16]]);
  });

  it('plays one bracket per group rank', () => {
    const structure = buildStructure(format(4, 2, { consolation: 'perRank', placements: 'all' }), 16);
    expect(structure.consolation!.brackets.map((b) => [b.id, b.bracket.placeOffset, b.byes])).toEqual([['C1', 8, 0], ['C2', 12, 0]]);
    expect(structure.consolation!.brackets[0]!.seats.every((s) => s?.type === 'qualifier' && s.rank === 3)).toBe(true);
    const state = playAll(structure, groupsDraw([4, 4, 4, 4]));
    expect(places(state)).toEqual(unique(16));
    // No fourth ends up ahead of a third
    expect(state.placements.slice(8, 12).every((p) => p.entryId[1] === '3')).toBe(true);
    expect(state.placements.slice(12).every((p) => p.entryId[1] === '4')).toBe(true);
  });

  it('gives a rank with a single entry its place without a match', () => {
    // Groups of 4/3/3: only group A has a fourth
    const structure = buildStructure(format(3, 2, { consolation: 'perRank', placements: 'all' }), 10);
    expect(structure.consolation!.direct).toEqual([{ seat: { type: 'qualifier', group: 0, rank: 4 }, place: 10 }]);
    // The three thirds play everybody against everybody
    expect(structure.consolation!.brackets).toHaveLength(0);
    expect(structure.consolation!.groups).toHaveLength(1);
    const state = playAll(structure, groupsDraw([4, 3, 3]));
    expect(places(state)).toEqual(unique(10));
    expect(state.placements.at(-1)!.entryId).toBe('A4');
  });

  it('combines with the best thirds advancing', () => {
    const structure = buildStructure(format(3, 2, { fillByes: true, consolation: 'perRank', placements: 'all' }), 12);
    // The one third that is left takes 9th place, the fourths play for 10th–12th
    expect(structure.consolation!.direct).toEqual([{ seat: { type: 'bestNext', rank: 3, index: 2 }, place: 9 }]);
    expect(structure.consolation!.groups.map((g) => g.placeOffset)).toEqual([9]);
    const state = playAll(structure, groupsDraw([4, 4, 4]));
    expect(places(state)).toEqual(unique(12));
    expect(state.placements[8]!.entryId).toBe(state.nextRanked!.rows[2]!.row.entryId);

    const joint = buildStructure(format(3, 2, { fillByes: true, consolation: 'bracket', placements: 'all' }), 12);
    expect(joint.consolation!.brackets[0]!.seats.filter((s) => s !== null)).toHaveLength(4);
    expect(places(playAll(joint, groupsDraw([4, 4, 4])))).toEqual(unique(12));
  });

  it('is left out where nobody is eliminated or one table ranks everybody', () => {
    expect(buildStructure(format(1, 2, { consolation: 'bracket' }), 6).consolation).toBeUndefined();
    expect(buildStructure(format(2, 2, { consolation: 'bracket' }), 4).consolation).toBeUndefined();
  });
});

describe('format settings', () => {
  it('offers only what has an effect', () => {
    expect(formatCapabilities(format(3, 2), 12)).toEqual({ placements: true, consolation: true, fillByes: true, swissRounds: null });
    expect(formatCapabilities(format(4, 2), 16)).toMatchObject({ consolation: true, fillByes: false });
    expect(formatCapabilities(format(1, 2), 6)).toMatchObject({ consolation: false, fillByes: false });
    expect(formatCapabilities({ groups: { groupCount: 1 } }, 6)).toEqual({ placements: false, consolation: false, fillByes: false, swissRounds: null });
    expect(formatCapabilities({ swiss: { rounds: 5 } }, 12).swissRounds).toEqual({ min: 4, recommended: 6, max: 11 });
  });

  it('applies settings to the formats that can take them', () => {
    const settings = { placements: 'all' as const, consolation: 'bracket' as const, fillByes: true, swissRounds: 4 };
    expect(applyFormatSettings(format(3, 2), 12, settings)).toEqual({
      groups: { groupCount: 3 },
      knockout: { qualifiersPerGroup: 2, placements: 'all', fillByes: true, consolation: 'bracket' },
    });
    expect(applyFormatSettings(format(4, 2), 16, settings).knockout).toEqual({ qualifiersPerGroup: 2, placements: 'all', consolation: 'bracket' });
    expect(applyFormatSettings({ knockout: { placements: 'none' } }, 12, settings)).toEqual({ knockout: { placements: 'all' } });
    expect(applyFormatSettings({ swiss: { rounds: 6 } }, 12, settings)).toEqual({ swiss: { rounds: 4 } });
    expect(applyFormatSettings({ swiss: { rounds: 6 } }, 6, { swissRounds: 9 })).toEqual({ swiss: { rounds: 5 } });
  });

  it('offers Swiss variants from six entries on', () => {
    expect(generateVariants(5).map((v) => v.id)).not.toContain('swiss');
    const variants = generateVariants(16, { fillByes: true });
    expect(variants.find((v) => v.id === 'swiss')!.format).toEqual({ swiss: { rounds: 6 } });
    expect(variants.find((v) => v.id === 'swiss-top8')!.format).toEqual({ swiss: { rounds: 6 }, knockout: { qualifiersPerGroup: 8, placements: 'none' } });
    expect(variants.find((v) => v.id === 'g3-top2')!.format.knockout).toMatchObject({ fillByes: true });
    expect(variants.find((v) => v.id === 'g4-top2')!.format.knockout!.fillByes).toBeUndefined();
  });
});
