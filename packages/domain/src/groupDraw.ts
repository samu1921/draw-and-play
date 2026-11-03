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

/** How seeded entries reach their groups or knockout positions */
export type SeedPlacement = 'fixed' | 'drawn';

export interface GroupDrawOptions {
  groupCount: number;
  /**
   * How many entries from the top of the seeding list are seeded (default `groupCount`: the group heads).
   * The others are not on the seeding list and are drawn freely into the remaining places.
   */
  seedCount?: number;
  /**
   * fixed (default): seeds go to the groups in snake order (1 → A, 2 → B, …, then back again).
   * drawn: the seeds are taken in pots of `groupCount` and each pot is drawn into the groups, one seed per group.
   */
  seedPlacement?: SeedPlacement;
  /** Without an RNG nothing is drawn: every entry is placed in snake order */
  rng?: Rng;
}

/**
 * Group draw by seeding list. Seeds are distributed pot by pot (pots of `groupCount` entries, at most one per group),
 * in snake order or drawn. The unseeded entries are then drawn row by row into the free places, one per group and
 * row. Draws keep entries with the same `club` apart where possible.
 * Group sizes follow `groupSizes` (larger groups first). Result: entries per group in seeding-list order (0 = group head).
 */
export function drawGroups(entries: readonly DrawEntry[], options: GroupDrawOptions): EntryId[][] {
  const { groupCount, rng } = options;
  const ranked = rankForSeeding(entries);
  const seedCount = rng ? Math.max(0, Math.min(options.seedCount ?? groupCount, ranked.length)) : ranked.length;
  const placement = rng ? (options.seedPlacement ?? 'fixed') : 'fixed';
  const capacity = groupSizes(ranked.length, groupCount);
  const groups: DrawEntry[][] = Array.from({ length: groupCount }, () => []);
  /** Groups that still have room, in group order */
  const open = () => groups.flatMap((g, i) => (g.length < capacity[i]! ? [i] : []));

  const seeds = ranked.slice(0, seedCount);
  for (let potIndex = 0; potIndex * groupCount < seeds.length; potIndex++) {
    const pot = seeds.slice(potIndex * groupCount, (potIndex + 1) * groupCount);
    if (placement === 'drawn') {
      place(pot, open(), rng!);
    } else {
      // Snake order over the groups with room: an incomplete last pot fills the first groups, as in `groupSizes`.
      const targets = potIndex % 2 === 0 ? open() : open().reverse();
      pot.forEach((entry, i) => groups[targets[i]!]!.push(entry));
    }
  }

  // Each row gives every group with room one entry. The free places always add up to the remaining entries,
  // so a row never has more groups than entries left.
  let unseeded = rng ? shuffle(ranked.slice(seedCount), rng) : ranked.slice(seedCount);
  while (unseeded.length > 0) {
    const targets = open();
    const row = unseeded.slice(0, targets.length);
    unseeded = unseeded.slice(targets.length);
    if (rng) place(row, targets, rng);
    else row.forEach((entry, i) => groups[targets[i]!]!.push(entry));
  }
  // Positions within a group follow the seeding list, so the group head is position 0.
  const rank = new Map(ranked.map((e, i) => [e, i]));
  return groups.map((g) => g.sort((a, b) => rank.get(a)! - rank.get(b)!).map((e) => e.id));

  function place(pot: readonly DrawEntry[], targets: readonly number[], random: Rng) {
    const assignment = assignPot(
      pot,
      targets.map((g) => groups[g]!),
      random,
    );
    pot.forEach((entry, i) => groups[targets[assignment[i]!]!]!.push(entry));
  }
}

/** Group (index into `groups`) per pot entry, each group at most once, with as few club conflicts as possible; random among equally good solutions. */
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
