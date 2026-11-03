import { describe, expect, it } from 'vitest';
import { drawGroups, groupSizes, rankForSeeding, type DrawEntry } from './groupDraw.js';
import { createRng } from './rng.js';

const players = (n: number, club?: (i: number) => string): DrawEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: `P${i + 1}`, rating: 2000 - i * 10, club: club?.(i) }));

describe('groupSizes', () => {
  it('distributes as evenly as possible, larger groups first', () => {
    expect(groupSizes(10, 3)).toEqual([4, 3, 3]);
    expect(groupSizes(12, 3)).toEqual([4, 4, 4]);
    expect(groupSizes(16, 3)).toEqual([6, 5, 5]);
    expect(groupSizes(5, 1)).toEqual([5]);
  });
});

describe('rankForSeeding', () => {
  it('puts manual seeds before the rating, others by rating', () => {
    const entries: DrawEntry[] = [
      { id: 'A', rating: 1500 },
      { id: 'B', rating: 1900 },
      { id: 'C', rating: 1200, seed: 1 },
      { id: 'D' },
      { id: 'E', rating: 1700 },
    ];
    expect(rankForSeeding(entries).map((e) => e.id)).toEqual(['C', 'B', 'E', 'A', 'D']);
  });
});

describe('drawGroups', () => {
  it('puts the seeds at position 1 of groups A, B, C …', () => {
    const groups = drawGroups(players(10), { groupCount: 3, rng: createRng(1) });
    expect(groups.map((g) => g.length)).toEqual([4, 3, 3]);
    expect(groups.map((g) => g[0])).toEqual(['P1', 'P2', 'P3']);
    expect(new Set(groups.flat()).size).toBe(10);
  });

  it('snake order across all pots', () => {
    const groups = drawGroups(players(8), { groupCount: 2, snakePots: Infinity });
    expect(groups).toEqual([
      ['P1', 'P4', 'P5', 'P8'],
      ['P2', 'P3', 'P6', 'P7'],
    ]);
  });

  it('each pot contributes at most one entry per group', () => {
    const groups = drawGroups(players(12), { groupCount: 4, rng: createRng('pots') });
    groups.forEach((g) => {
      expect(g).toHaveLength(3);
      // pot 2 = P5–P8, pot 3 = P9–P12
      const pot = (id: string) => Math.floor((Number(id.slice(1)) - 1) / 4);
      expect(g.map(pot)).toEqual([0, 1, 2]);
    });
  });

  it('is reproducible with the same seed', () => {
    const a = drawGroups(players(11), { groupCount: 3, rng: createRng('vm') });
    const b = drawGroups(players(11), { groupCount: 3, rng: createRng('vm') });
    expect(a).toEqual(b);
    const variants = new Set(
      Array.from({ length: 10 }, (_, s) => JSON.stringify(drawGroups(players(11), { groupCount: 3, rng: createRng(s) }))),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('keeps entries from the same club apart where possible', () => {
    // 4 clubs with 2 entries each: pot 1 = P1–P4 (clubs W, X, Y, Z), pot 2 = P5–P8 (clubs Z, Y, X, W)
    const clubs = ['W', 'X', 'Y', 'Z', 'Z', 'Y', 'X', 'W'];
    const entries = players(8, (i) => clubs[i]!);
    const clubOf = new Map(entries.map((e) => [e.id, e.club]));
    for (let seed = 0; seed < 25; seed++) {
      const groups = drawGroups(entries, { groupCount: 4, rng: createRng(seed) });
      for (const g of groups) {
        const gClubs = g.map((id) => clubOf.get(id));
        expect(new Set(gClubs).size, `seed ${seed}: ${g.join(',')}`).toBe(gClubs.length);
      }
    }
  });

  it('always fills the larger groups first, matching groupSizes', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(drawGroups(players(10), { groupCount: 3, rng: createRng(seed) }).map((g) => g.length)).toEqual(groupSizes(10, 3));
      expect(drawGroups(players(16), { groupCount: 3, rng: createRng(seed) }).map((g) => g.length)).toEqual(groupSizes(16, 3));
    }
    expect(drawGroups(players(11), { groupCount: 3, snakePots: Infinity }).map((g) => g.length)).toEqual(groupSizes(11, 3));
  });

  it('a single group holds everyone in seeding order', () => {
    expect(drawGroups(players(5), { groupCount: 1, rng: createRng(3) })).toEqual([['P1', 'P2', 'P3', 'P4', 'P5']]);
  });
});
