import { rankForSeeding, type DrawEntry } from './groupDraw.js';
import { shuffle, type Rng } from './rng.js';
import type { EntryId } from './standings.js';

/**
 * seeded: the upper half of the seeding list is seeded, each of them gets a partner drawn from the lower half.
 * random: everyone is drawn, no seeding.
 */
export type PairDrawMode = 'seeded' | 'random';

/**
 * Draws doubles pairs from single players. Each pair lists the stronger player (by seeding list) first;
 * pairs are returned in seeding-list order of that player. Needs an even number of players.
 */
export function drawPairs(players: readonly DrawEntry[], mode: PairDrawMode, rng: Rng): [EntryId, EntryId][] {
  if (players.length % 2 !== 0) throw new Error(`Pair draw needs an even number of players, got ${players.length}`);
  const ranked = rankForSeeding(players).map((p) => p.id);
  const rank = new Map(ranked.map((id, i) => [id, i]));
  const half = ranked.length / 2;

  let pairs: [EntryId, EntryId][];
  if (mode === 'seeded') {
    const partners = shuffle(ranked.slice(half), rng);
    pairs = ranked.slice(0, half).map((id, i) => [id, partners[i]!]);
  } else {
    const order = shuffle(ranked, rng);
    pairs = Array.from({ length: half }, (_, i) => {
      const [a, b] = [order[2 * i]!, order[2 * i + 1]!];
      return rank.get(a)! < rank.get(b)! ? [a, b] : [b, a];
    });
  }
  return pairs.sort((a, b) => rank.get(a[0])! - rank.get(b[0])!);
}
