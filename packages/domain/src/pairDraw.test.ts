import { describe, expect, it } from 'vitest';
import type { DrawEntry } from './groupDraw.js';
import { drawPairs } from './pairDraw.js';
import { createRng } from './rng.js';

const players = (n: number): DrawEntry[] => Array.from({ length: n }, (_, i) => ({ id: `P${i + 1}`, rating: 2000 - i * 10 }));
const num = (id: string) => Number(id.slice(1));

describe('drawPairs', () => {
  it('seeded: every seeded player gets a partner from the lower half', () => {
    const partners = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const pairs = drawPairs(players(8), 'seeded', createRng(seed));
      expect(pairs.map((p) => p[0])).toEqual(['P1', 'P2', 'P3', 'P4']);
      expect(pairs.map((p) => p[1]).sort()).toEqual(['P5', 'P6', 'P7', 'P8']);
      partners.add(pairs[0]![1]);
    }
    expect(partners.size).toBeGreaterThan(1);
  });

  it('seeded: manual seeds decide who is seeded', () => {
    const list: DrawEntry[] = [...players(4), { id: 'X', rating: 1000, seed: 1 }, { id: 'Y', rating: 900 }];
    const pairs = drawPairs(list, 'seeded', createRng('m'));
    expect(pairs.map((p) => p[0])).toEqual(['X', 'P1', 'P2']);
  });

  it('random: pairs anyone, stronger player first, reproducibly', () => {
    const a = drawPairs(players(10), 'random', createRng('r'));
    expect(a).toEqual(drawPairs(players(10), 'random', createRng('r')));
    expect(new Set(a.flat()).size).toBe(10);
    a.forEach(([x, y]) => expect(num(x)).toBeLessThan(num(y)));
    const lowerHalfSeeded = Array.from({ length: 20 }, (_, s) => drawPairs(players(10), 'random', createRng(s))).some((pairs) =>
      pairs.some(([x, y]) => num(x) <= 5 && num(y) <= 5),
    );
    expect(lowerHalfSeeded).toBe(true);
  });

  it('rejects an odd number of players', () => {
    expect(() => drawPairs(players(5), 'seeded', createRng(1))).toThrow();
  });
});
