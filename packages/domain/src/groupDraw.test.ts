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

  it('snake order across all pots without an RNG', () => {
    const groups = drawGroups(players(8), { groupCount: 2 });
    expect(groups).toEqual([
      ['P1', 'P4', 'P5', 'P8'],
      ['P2', 'P3', 'P6', 'P7'],
    ]);
  });

  it('drawn seeds: each pot contributes at most one entry per group', () => {
    const groups = drawGroups(players(12), { groupCount: 4, seedCount: 12, seedPlacement: 'drawn', rng: createRng('pots') });
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
    expect(drawGroups(players(11), { groupCount: 3 }).map((g) => g.length)).toEqual(groupSizes(11, 3));
    for (const seedCount of [0, 3, 5, 9, 10]) {
      for (const seedPlacement of ['fixed', 'drawn'] as const) {
        const groups = drawGroups(players(10), { groupCount: 3, seedCount, seedPlacement, rng: createRng(seedCount) });
        expect(groups.map((g) => g.length)).toEqual(groupSizes(10, 3));
        expect(new Set(groups.flat()).size).toBe(10);
      }
    }
  });

  it('fixed seeds follow the snake, the unseeded are drawn into the free places', () => {
    // 16 entries, 4 groups, half seeded: P1–P4 → A–D, P5–P8 → D–A
    const heads = new Set<string>();
    for (let seed = 0; seed < 15; seed++) {
      const groups = drawGroups(players(16), { groupCount: 4, seedCount: 8, rng: createRng(seed) });
      expect(groups.map((g) => g.slice(0, 2))).toEqual([
        ['P1', 'P8'],
        ['P2', 'P7'],
        ['P3', 'P6'],
        ['P4', 'P5'],
      ]);
      heads.add(groups.map((g) => g.slice(2).join()).join('|'));
    }
    expect(heads.size).toBeGreaterThan(1);
  });

  it('drawn seeds land in random groups, still one seed per group and pot', () => {
    const firstGroupOfP1 = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      const groups = drawGroups(players(16), { groupCount: 4, seedCount: 8, seedPlacement: 'drawn', rng: createRng(seed) });
      const seedsPerGroup = groups.map((g) => g.filter((id) => Number(id.slice(1)) <= 8));
      seedsPerGroup.forEach((s) => {
        expect(s).toHaveLength(2);
        expect(Number(s[0]!.slice(1))).toBeLessThanOrEqual(4);
        expect(Number(s[1]!.slice(1))).toBeGreaterThan(4);
      });
      firstGroupOfP1.add(groups.findIndex((g) => g.includes('P1')));
    }
    expect(firstGroupOfP1.size).toBeGreaterThan(1);
  });

  it('without seeds everyone is drawn, keeping the group sizes', () => {
    const groups = drawGroups(players(9), { groupCount: 3, seedCount: 0, rng: createRng('free') });
    expect(groups.map((g) => g.length)).toEqual([3, 3, 3]);
    expect(new Set(groups.flat()).size).toBe(9);
  });

  it('a single group holds everyone in seeding order', () => {
    expect(drawGroups(players(5), { groupCount: 1, rng: createRng(3) })).toEqual([['P1', 'P2', 'P3', 'P4', 'P5']]);
  });
});
