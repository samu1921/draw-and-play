import { shuffle, type Rng } from './rng.js';
import type { EntryId } from './standings.js';

export interface DrawEntry {
  id: EntryId;
  /** Rating used for seeding (table tennis: QTTR) */
  rating?: number | undefined;
  /** Manual seed (1 = strongest), takes precedence over the rating */
  seed?: number | undefined;
  /** Attribute to keep apart in the draw, e.g. the club */
  club?: string | undefined;
}

/** Group sizes as even as possible, larger groups first: 10 into 3 → [4, 3, 3] */
export function groupSizes(entryCount: number, groupCount: number): number[] {
  const base = Math.floor(entryCount / groupCount);
  const extra = entryCount % groupCount;
  return Array.from({ length: groupCount }, (_, g) => base + (g < extra ? 1 : 0));
}

/** Seeding list: manual seeds first, then by rating descending, unrated last (stable). */
export function rankForSeeding<T extends DrawEntry>(entries: readonly T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const seedA = a.entry.seed ?? Number.POSITIVE_INFINITY;
      const seedB = b.entry.seed ?? Number.POSITIVE_INFINITY;
      if (seedA !== seedB) return seedA - seedB;
      const ratingA = a.entry.rating ?? Number.NEGATIVE_INFINITY;
      const ratingB = b.entry.rating ?? Number.NEGATIVE_INFINITY;
      if (ratingA !== ratingB) return ratingB - ratingA;
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}

export interface GroupDrawOptions {
  groupCount: number;
  /**
   * How many pots (of `groupCount` entries each, taken from the seeding list) are distributed in snake order.
   * Default 1: only the group heads; `Infinity` = full snake, no randomness.
   */
  snakePots?: number;
  /** For the randomly drawn pots; without an RNG they are distributed like the snake */
  rng?: Rng;
}

/**
 * Group draw by pots: the seeding list is split into pots of `groupCount` entries and each group gets at most
 * one entry per pot. The first pots are distributed in snake order, the rest is drawn, keeping entries with the
 * same `club` apart where possible.
 * Result: entries per group in position order (position 0 = group head).
 */
export function drawGroups(entries: readonly DrawEntry[], options: GroupDrawOptions): EntryId[][] {
  const { groupCount, rng } = options;
  const snakePots = options.snakePots ?? 1;
  const ranked = rankForSeeding(entries);
  const groups: DrawEntry[][] = Array.from({ length: groupCount }, () => []);

  for (let potIndex = 0; potIndex * groupCount < ranked.length; potIndex++) {
    const pot = ranked.slice(potIndex * groupCount, (potIndex + 1) * groupCount);
    const forward = potIndex % 2 === 0;
    if (potIndex < snakePots || !rng) {
      pot.forEach((entry, i) => groups[forward ? i : groupCount - 1 - i]!.push(entry));
    } else {
      const targets = assignPot(pot, groups, rng);
      pot.forEach((entry, i) => groups[targets[i]!]!.push(entry));
    }
  }
  return groups.map((g) => g.map((e) => e.id));
}

/** Group per pot entry with as few club conflicts as possible; random among equally good solutions. */
function assignPot(pot: readonly DrawEntry[], groups: readonly DrawEntry[][], rng: Rng): number[] {
  const conflicts = (entry: DrawEntry, group: number) =>
    entry.club === undefined ? 0 : groups[group]!.filter((e) => e.club === entry.club).length;

  // Random candidate order, then the first solution with minimal conflicts (branch and bound).
  const order = shuffle(
    pot.map((_, i) => i),
    rng,
  );
  const groupOrder = shuffle(
    groups.map((_, g) => g),
    rng,
  );
  const best = { cost: Number.POSITIVE_INFINITY, assignment: [] as number[] };
  const current: number[] = [];
  const used = new Set<number>();
  let budget = 50_000;

  const search = (k: number, cost: number) => {
    if (cost >= best.cost || budget-- <= 0) return;
    if (k === order.length) {
      best.cost = cost;
      best.assignment = [...current];
      return;
    }
    const entry = pot[order[k]!]!;
    const options = groupOrder.filter((g) => !used.has(g)).map((g) => ({ g, c: conflicts(entry, g) }));
    options.sort((a, b) => a.c - b.c); // stable: equal costs keep the random order
    for (const { g, c } of options) {
      used.add(g);
      current[order[k]!] = g;
      search(k + 1, cost + c);
      used.delete(g);
      if (best.cost === 0) return;
    }
  };
  search(0, 0);
  return best.assignment;
}
