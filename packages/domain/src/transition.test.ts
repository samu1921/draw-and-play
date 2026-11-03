import { describe, expect, it } from 'vitest';
import { meetingRound } from './bracket.js';
import { compareAcrossGroups, groupLetter, placeQualifiers, qualifierOrder } from './transition.js';
import type { StandingsRow } from './standings.js';

const label = (q: { group: number; rank: number } | null | undefined) => (q ? `${groupLetter(q.group)}${q.rank}` : '–');

function seatsFor(groupCount: number, perGroup: number) {
  const qualifiers = qualifierOrder(groupCount, perGroup);
  return placeQualifiers(qualifiers).map((i) => (i === null ? null : qualifiers[i]!));
}

describe('groupLetter', () => {
  it('A–Z, then numbers', () => {
    expect(groupLetter(0)).toBe('A');
    expect(groupLetter(25)).toBe('Z');
    expect(groupLetter(26)).toBe('27');
  });
});

describe('qualifierOrder', () => {
  it('lists all group winners first, then all runners-up', () => {
    expect(qualifierOrder(3, 2).map(label)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  });
});

describe('placeQualifiers', () => {
  it('2 groups, top 2 → crossed semifinals: A1–B2, A2–B1', () => {
    expect(seatsFor(2, 2).map(label)).toEqual(['A1', 'B2', 'A2', 'B1']);
  });

  it('1 group, top 4 → semifinals 1–4 and 2–3', () => {
    expect(seatsFor(1, 4).map(label)).toEqual(['A1', 'A4', 'A3', 'A2']);
  });

  it('1 group, top 2 → final', () => {
    expect(seatsFor(1, 2).map(label)).toEqual(['A1', 'A2']);
  });

  it('4 groups, top 2 → quarterfinals, winner and runner-up of a group in different halves', () => {
    const seats = seatsFor(4, 2);
    // First round: always a group winner against a runner-up from another group
    for (let p = 0; p < 8; p += 2) {
      const [a, b] = [seats[p]!, seats[p + 1]!];
      expect([a.rank, b.rank].sort()).toEqual([1, 2]);
      expect(a.group).not.toBe(b.group);
    }
    for (let g = 0; g < 4; g++) {
      const first = seats.findIndex((q) => q?.group === g && q.rank === 1);
      const second = seats.findIndex((q) => q?.group === g && q.rank === 2);
      expect(meetingRound(first, second), `group ${groupLetter(g)}`).toBe(3);
    }
  });

  it('3 groups, top 2 → bracket of 8 with 2 byes for the best group winners', () => {
    const seats = seatsFor(3, 2);
    expect(seats).toHaveLength(8);
    const byeOpponents = [0, 2, 4, 6].flatMap((p) =>
      seats[p] === null ? [seats[p + 1]] : seats[p + 1] === null ? [seats[p]] : [],
    );
    expect(byeOpponents.map(label).sort()).toEqual(['A1', 'B1']);
    for (let g = 0; g < 3; g++) {
      const first = seats.findIndex((q) => q?.group === g && q.rank === 1);
      const second = seats.findIndex((q) => q?.group === g && q.rank === 2);
      expect(meetingRound(first, second)).toBe(3);
    }
  });
});

describe('compareAcrossGroups', () => {
  const row = (entryId: string, won: number, played: number, gamesWon: number, gamesLost: number): StandingsRow => ({
    entryId,
    rank: 1,
    played,
    won,
    lost: played - won,
    matchPoints: won,
    gamesWon,
    gamesLost,
    pointsWon: 0,
    pointsLost: 0,
  });

  it('compares relatively across groups of different sizes', () => {
    // A: 3 of 3 wins; B: 3 of 4 wins (same absolute count, worse ratio)
    const sorted = [row('B', 3, 4, 9, 3), row('A', 3, 3, 9, 2)].sort(compareAcrossGroups);
    expect(sorted.map((r) => r.entryId)).toEqual(['A', 'B']);
  });

  it('with the same win ratio, game difference per match decides', () => {
    const sorted = [row('A', 2, 2, 6, 2), row('B', 2, 2, 6, 0)].sort(compareAcrossGroups);
    expect(sorted.map((r) => r.entryId)).toEqual(['B', 'A']);
  });
});
