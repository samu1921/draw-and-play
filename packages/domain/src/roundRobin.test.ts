import { describe, expect, it } from 'vitest';
import { clubDuelsFirst, roundRobinSchedule, type Pairing } from './roundRobin.js';

const key = ([a, b]: Pairing) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function expectValidRoundRobin(rounds: Pairing[][], size: number, timesEach = 1) {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    const used = new Set<number>();
    for (const pairing of round) {
      for (const p of pairing) {
        expect(used.has(p), `position ${p} plays twice in one round`).toBe(false);
        used.add(p);
      }
      counts.set(key(pairing), (counts.get(key(pairing)) ?? 0) + 1);
    }
  }
  expect(counts.size).toBe((size * (size - 1)) / 2);
  for (const c of counts.values()) expect(c).toBe(timesEach);
}

describe('roundRobinSchedule', () => {
  it.each([
    [2, 1, 1],
    [3, 3, 1],
    [4, 3, 2],
    [5, 5, 2],
    [6, 5, 3],
    [8, 7, 4],
    [16, 15, 8],
  ])('%i entries: %i rounds of %i matches, every pairing exactly once', (size, rounds, perRound) => {
    const schedule = roundRobinSchedule(size);
    expect(schedule).toHaveLength(rounds);
    for (const round of schedule) expect(round).toHaveLength(perRound);
    expectValidRoundRobin(schedule, size);
  });

  it('has no matches for 0 or 1 entries', () => {
    expect(roundRobinSchedule(0)).toEqual([]);
    expect(roundRobinSchedule(1)).toEqual([]);
  });

  it.each([3, 4, 5, 6, 7, 8])('with %i entries the two top seeds meet in the last round', (size) => {
    const schedule = roundRobinSchedule(size);
    expect(schedule.at(-1)!.map(key)).toContain('0-1');
  });

  it('double round robin: every pairing twice, sides swapped', () => {
    const schedule = roundRobinSchedule(4, { double: true });
    expect(schedule).toHaveLength(6);
    expectValidRoundRobin(schedule, 4, 2);
    const firstLeg = schedule.slice(0, 3).flat();
    const secondLeg = schedule.slice(3).flat();
    for (const [a, b] of firstLeg) {
      expect(secondLeg).toContainEqual([b, a]);
    }
  });
});

describe('clubDuelsFirst', () => {
  it('moves the round with the most same-club duels to the front', () => {
    const schedule = roundRobinSchedule(4);
    // Positions 0 and 1 share a club; without reordering their pairing is in the last round.
    const clubs = ['TTC', 'TTC', 'SV', 'TSG'];
    const reordered = clubDuelsFirst(schedule, (p) => clubs[p]);
    expect(reordered[0]!.map(key)).toContain('0-1');
    expectValidRoundRobin(reordered, 4);
  });

  it('keeps the order when there are no same-club duels', () => {
    const schedule = roundRobinSchedule(5);
    expect(clubDuelsFirst(schedule, (p) => `club${p}`)).toEqual(schedule);
  });
});
