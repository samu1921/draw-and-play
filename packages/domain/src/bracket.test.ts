import { describe, expect, it } from 'vitest';
import { bracketSize, drawKnockout, meetingRound, seedLayout, seedPositions, seedTiers } from './bracket.js';
import { createRng } from './rng.js';

describe('bracketSize', () => {
  it.each([
    [1, 2],
    [2, 2],
    [3, 4],
    [5, 8],
    [8, 8],
    [9, 16],
    [33, 64],
  ])('%i entries → bracket of %i', (n, size) => {
    expect(bracketSize(n)).toBe(size);
  });
});

describe('seedLayout', () => {
  it('puts seed 1 at the top and seed 2 at the bottom; first round is seed s vs size+1−s', () => {
    expect(seedLayout(2)).toEqual([1, 2]);
    expect(seedLayout(4)).toEqual([1, 4, 3, 2]);
    expect(seedLayout(8)).toEqual([1, 8, 5, 4, 3, 6, 7, 2]);
  });

  it('puts seeds 3 and 4 in the middle (end of top half / start of bottom half)', () => {
    const layout = seedLayout(16);
    expect(layout[0]).toBe(1);
    expect(layout[15]).toBe(2);
    expect([layout[7], layout[8]].sort()).toEqual([3, 4]);
    for (let p = 0; p < 16; p += 2) expect(layout[p]! + layout[p + 1]!).toBe(17);
  });

  it('seedPositions is the inverse', () => {
    const layout = seedLayout(32);
    const positions = seedPositions(32);
    layout.forEach((seed, pos) => expect(positions[seed - 1]).toBe(pos));
  });
});

describe('seedTiers', () => {
  it('builds tiers 1 | 2 | 3–4 | 5–8 | 9–16, cut at the count', () => {
    expect(seedTiers(8)).toEqual([[1], [2], [3, 4], [5, 6, 7, 8]]);
    expect(seedTiers(6)).toEqual([[1], [2], [3, 4], [5, 6]]);
    expect(seedTiers(1)).toEqual([[1]]);
    expect(seedTiers(0)).toEqual([]);
  });
});

describe('meetingRound', () => {
  it('returns the earliest round in which two positions can meet', () => {
    expect(meetingRound(0, 1)).toBe(1);
    expect(meetingRound(0, 2)).toBe(2);
    expect(meetingRound(0, 7)).toBe(3);
    expect(meetingRound(5, 4)).toBe(1);
  });
});

describe('drawKnockout', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);

  it('gives byes to the top of the seeding list', () => {
    const seats = drawKnockout(ids(6), { seedCount: 6 });
    expect(seats).toEqual(['S1', null, 'S5', 'S4', 'S3', 'S6', null, 'S2']);
  });

  it('never pairs two byes', () => {
    for (const n of [3, 5, 9, 17]) {
      const seats = drawKnockout(ids(n), { seedCount: 2, rng: createRng(n) });
      for (let p = 0; p < seats.length; p += 2) {
        expect(seats[p] === null && seats[p + 1] === null).toBe(false);
      }
      expect(seats.filter((s) => s !== null)).toHaveLength(n);
    }
  });

  it('draws unseeded entries reproducibly onto the open positions', () => {
    const a = drawKnockout(ids(8), { seedCount: 2, rng: createRng('ko') });
    const b = drawKnockout(ids(8), { seedCount: 2, rng: createRng('ko') });
    expect(a).toEqual(b);
    expect(a[0]).toBe('S1');
    expect(a[7]).toBe('S2');
    expect(new Set(a).size).toBe(8);
  });

  it('draws seeds 3/4 among themselves when requested', () => {
    const placements = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const seats = drawKnockout(ids(8), { seedCount: 4, rng: createRng(seed), drawSeedTiers: true });
      expect(seats[0]).toBe('S1');
      expect(seats[7]).toBe('S2');
      expect([seats[3], seats[4]].sort()).toEqual(['S3', 'S4']);
      placements.add(`${seats[3]}`);
    }
    expect(placements.size).toBe(2);
  });
});
