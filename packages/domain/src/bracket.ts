import { shuffle, type Rng } from './rng.js';
import type { EntryId } from './standings.js';

/** Smallest power of two ≥ n (at least 2) */
export function bracketSize(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/**
 * Seed number (1-based) per position of a bracket: 1 at the top, 2 at the bottom, 3/4 in the middle,
 * 5–8 at the quarter boundaries and so on. In the first round seed s meets seed size+1−s.
 */
export function seedLayout(size: number): number[] {
  if (size === 2) return [1, 2];
  const half = seedLayout(size / 2);
  // Top half holds seeds 1, 4, 5, 8, 9, …; bottom half 2, 3, 6, 7, … (mirrored so that seed 2 ends up last)
  const top = Array.from({ length: size / 2 }, (_, i) => (i % 2 === 0 ? 2 * i + 1 : 2 * i + 2));
  const bottom = Array.from({ length: size / 2 }, (_, i) => (i % 2 === 0 ? 2 * i + 2 : 2 * i + 1));
  return [...half.map((local) => top[local - 1]!), ...half.map((local) => bottom[local - 1]!).reverse()];
}

/** Position per seed: `seedPositions(size)[s - 1]` is the position of seed s */
export function seedPositions(size: number): number[] {
  const positions: number[] = [];
  seedLayout(size).forEach((seed, pos) => (positions[seed - 1] = pos));
  return positions;
}

/** Round (1-based) in which two bracket positions can meet at the earliest */
export function meetingRound(a: number, b: number): number {
  return Math.floor(Math.log2(a ^ b)) + 1;
}

/** Seed tiers that may be drawn among themselves: [1], [2], [3, 4], [5–8], … */
export function seedTiers(count: number): number[][] {
  const tiers: number[][] = [];
  let start = 1;
  while (start <= count) {
    const end = Math.min(start <= 2 ? start : 2 * start - 2, count);
    tiers.push(Array.from({ length: end - start + 1 }, (_, i) => start + i));
    start = end + 1;
  }
  return tiers;
}

export interface KnockoutDrawOptions {
  /** How many of the best entries get fixed seed positions; the rest is drawn */
  seedCount: number;
  /** Without an RNG, unseeded entries are placed in list order (deterministic) */
  rng?: Rng;
  /** Draw seeds 3/4, 5–8, … among their tier (common in table tennis) */
  drawSeedTiers?: boolean;
}

/**
 * Knockout draw. `ranked` is sorted by strength (seeding list first).
 * Byes sit on the positions of the unused seeds, so they go to the best entries.
 * Result: occupant per position, `null` = bye.
 */
export function drawKnockout(ranked: readonly EntryId[], options: KnockoutDrawOptions): (EntryId | null)[] {
  const n = ranked.length;
  const size = bracketSize(n);
  const positions = seedPositions(size);
  const seats: (EntryId | null | undefined)[] = Array.from({ length: size }, () => undefined);
  const seedCount = Math.min(options.seedCount, n);

  for (const tier of seedTiers(seedCount)) {
    const tierPositions = tier.map((s) => positions[s - 1]!);
    const drawn = options.drawSeedTiers && options.rng ? shuffle(tierPositions, options.rng) : tierPositions;
    tier.forEach((s, i) => (seats[drawn[i]!] = ranked[s - 1]!));
  }
  for (let s = n + 1; s <= size; s++) {
    seats[positions[s - 1]!] = null;
  }

  const unseeded = ranked.slice(seedCount);
  const open = seats.flatMap((seat, pos) => (seat === undefined ? [pos] : []));
  const order = options.rng ? shuffle(unseeded, options.rng) : unseeded;
  open.forEach((pos, i) => (seats[pos] = order[i]!));
  return seats as (EntryId | null)[];
}
