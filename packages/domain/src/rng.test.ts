import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from './rng.js';

describe('createRng', () => {
  it('yields the same sequence for the same seed', () => {
    const a = createRng('club-2026');
    const b = createRng('club-2026');
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('yields a different sequence for a different seed', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('yields values in [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) yields integers in [0, n)', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(rng.int(4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('shuffle', () => {
  it('is reproducible and leaves the input untouched', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(items, createRng('x'));
    const b = shuffle(items, createRng('x'));
    expect(a).toEqual(b);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...a].sort()).toEqual(items);
  });
});
