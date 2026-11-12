import { createRng } from './rng.js';
import { roundRobinSchedule, type Pairing } from './roundRobin.js';

/** Fewest and most players of a doubles competition with rotating partners */
export const ROTATION_MIN_ENTRIES = 4;
export const ROTATION_MAX_ENTRIES = 32;

/** A doubles match of positions in the draw order: two pairs of partners */
export type RotationMatch = [Pairing, Pairing];

export interface RotationSchedule {
  /** Per round its matches; nobody plays twice in a round */
  rounds: RotationMatch[][];
  /** Every player plays this many matches, each with a different partner */
  matchesPerPlayer: number;
}

/**
 * Matches per player with rotating partners: everybody partners everybody else once (n − 1 matches) when the
 * pairs add up to whole matches, which is the case for 4k and 4k + 1 players. Otherwise as many as possible with
 * the same number for everybody: 4k + 2 players leave out one partner each, 4k + 3 players two.
 */
export function rotationMatchesPerPlayer(players: number): number {
  return players - 1 - (players % 4 === 2 ? 1 : players % 4 === 3 ? 2 : 0);
}

const cache = new Map<number, RotationSchedule>();

/** Random changes tried to get out of a local optimum when spreading the opponents */
const KICKS = 300;

/**
 * Doubles with rotating partners: every player plays with every other player as partner at most once, everybody
 * plays the same number of matches, and the opponents are spread as evenly as possible.
 *
 * The partner pairs come from the circle method, one round per perfect matching of the players:
 * - 4k players: every round has an even number of pairs, every pair plays once.
 * - 4k + 1: the circle method with a free slot; whoever it meets sits out the round.
 * - 4k + 2: the circle method with two free slots, without the round in which they meet each other. The pairs
 *   of that round never play together, everybody else meets twice in a free slot and sits out.
 * - 4k + 3: like 4k + 1, and one more pair of every round sits out, chosen so that everybody sits out the same.
 * Within a round, the pairs are matched against each other so that players meet the same opponents rarely.
 */
export function rotationSchedule(players: number): RotationSchedule {
  if (!Number.isInteger(players) || players < ROTATION_MIN_ENTRIES || players > ROTATION_MAX_ENTRIES) {
    throw new Error(`Rotating partners need ${ROTATION_MIN_ENTRIES}–${ROTATION_MAX_ENTRIES} players, got ${players}`);
  }
  const cached = cache.get(players);
  if (cached) return cached;
  const pairsOf = partnerRounds(players);
  const rounds = spreadOpponents(pairsOf.map(greedyMatches), players);
  const schedule = { rounds, matchesPerPlayer: rotationMatchesPerPlayer(players) };
  cache.set(players, schedule);
  return schedule;
}

/** The partner pairs of every round, an even number per round */
function partnerRounds(n: number): Pairing[][] {
  switch (n % 4) {
    case 0:
    case 1:
      return roundRobinSchedule(n);
    case 2: {
      // Positions n and n + 1 are free slots.
      const rounds = roundRobinSchedule(n + 2);
      return rounds
        .filter((round) => !round.some(([a, b]) => a === n && b === n + 1))
        .map((round) => round.filter(([a, b]) => a < n && b < n));
    }
    default: {
      const rounds = roundRobinSchedule(n);
      const idle = idlePairs(rounds, n);
      return rounds.map((round, r) => round.filter((pair) => pair !== idle[r]));
    }
  }
}

/**
 * One pair per round that sits out, so that every player sits out in exactly two of them. Each round of an odd
 * circle method already has one player sitting out; with these everybody sits out three times.
 */
function idlePairs(rounds: readonly Pairing[][], n: number): Pairing[] {
  const count = new Array<number>(n).fill(0);
  const chosen: Pairing[] = [];
  // Rounds in which a player can still sit out, to give up early when somebody can no longer reach two
  const remaining = new Array<number>(n).fill(0);
  for (const round of rounds) for (const [a, b] of round) remaining[a]!++, remaining[b]!++;

  const search = (r: number): boolean => {
    if (r === rounds.length) return count.every((c) => c === 2);
    const round = rounds[r]!;
    for (const [a, b] of round) remaining[a]!--, remaining[b]!--;
    // Players with the fewest chances left first
    const options = round
      .filter(([a, b]) => count[a]! < 2 && count[b]! < 2)
      .sort(([a, b], [c, d]) => remaining[a]! + remaining[b]! - remaining[c]! - remaining[d]!);
    for (const pair of options) {
      const [a, b] = pair;
      count[a]!++;
      count[b]!++;
      chosen.push(pair);
      if (count.every((c, p) => c + remaining[p]! >= 2) && search(r + 1)) return true;
      chosen.pop();
      count[a]!--;
      count[b]!--;
    }
    for (const [a, b] of round) remaining[a]!++, remaining[b]!++;
    return false;
  };
  if (!search(0)) throw new Error(`No rotation schedule for ${n} players`);
  return chosen;
}

/** A first pairing of the pairs of a round: in their order */
function greedyMatches(pairs: readonly Pairing[]): RotationMatch[] {
  return Array.from({ length: pairs.length / 2 }, (_, i) => ordered(pairs[2 * i]!, pairs[2 * i + 1]!));
}

const ordered = (p: Pairing, q: Pairing): RotationMatch => (p[0] < q[0] ? [p, q] : [q, p]);

/**
 * Regroups the pairs within each round so that players meet each opponent about equally often: minimises the
 * sum of the squared numbers of meetings by swapping opponents between two matches of a round, with random
 * changes in between to leave local optima. Reproducible: the random changes use a fixed seed.
 */
function spreadOpponents(start: RotationMatch[][], n: number): RotationMatch[][] {
  const opponents = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const add = ([p, q]: RotationMatch, delta: number) => {
    for (const x of p) {
      for (const y of q) {
        opponents[x]![y]! += delta;
        opponents[y]![x]! += delta;
      }
    }
  };
  /** Meetings so far across the two pairs; with the match itself taken out this is what it would add */
  const cost = (p: Pairing, q: Pairing) => opponents[p[0]]![q[0]]! + opponents[p[0]]![q[1]]! + opponents[p[1]]![q[0]]! + opponents[p[1]]![q[1]]!;
  const score = () => opponents.reduce((sum, row) => sum + row.reduce((s, v) => s + v * v, 0), 0);

  const rounds = start.map((round) => [...round]);
  for (const round of rounds) for (const match of round) add(match, 1);

  /** Swaps opponents between matches i and j of a round: variant 1 = P–R/Q–S, 2 = P–S/Q–R */
  const swap = (round: RotationMatch[], i: number, j: number, variant: 1 | 2) => {
    const [p, q] = round[i]!;
    const [r, s] = round[j]!;
    add(round[i]!, -1);
    add(round[j]!, -1);
    round[i] = variant === 1 ? ordered(p, r) : ordered(p, s);
    round[j] = variant === 1 ? ordered(q, s) : ordered(q, r);
    add(round[i]!, 1);
    add(round[j]!, 1);
  };
  const climb = () => {
    for (let improved = true; improved; ) {
      improved = false;
      for (const round of rounds) {
        for (let i = 0; i < round.length; i++) {
          for (let j = i + 1; j < round.length; j++) {
            const [p, q] = round[i]!;
            const [r, s] = round[j]!;
            add(round[i]!, -1);
            add(round[j]!, -1);
            const now = cost(p, q) + cost(r, s);
            const first = cost(p, r) + cost(q, s);
            const second = cost(p, s) + cost(q, r);
            add(round[i]!, 1);
            add(round[j]!, 1);
            if (first < now && first <= second) swap(round, i, j, 1);
            else if (second < now) swap(round, i, j, 2);
            else continue;
            improved = true;
          }
        }
      }
    }
  };

  climb();
  let best = { score: score(), rounds: rounds.map((round) => [...round]) };
  const rng = createRng(`rotation:${n}`);
  const open = rounds.map((round, r) => (round.length > 1 ? r : -1)).filter((r) => r >= 0);
  for (let kick = 0; kick < KICKS && open.length > 0; kick++) {
    for (let k = 0; k < 2; k++) {
      const round = rounds[open[rng.int(open.length)]!]!;
      const i = rng.int(round.length);
      const j = (i + 1 + rng.int(round.length - 1)) % round.length;
      swap(round, i, j, rng.int(2) === 0 ? 1 : 2);
    }
    climb();
    const now = score();
    if (now < best.score) best = { score: now, rounds: rounds.map((round) => [...round]) };
    else if (now > best.score) {
      // Back to the best schedule so far
      for (const round of rounds) for (const match of round) add(match, -1);
      best.rounds.forEach((round, r) => (rounds[r] = [...round]));
      for (const round of rounds) for (const match of round) add(match, 1);
    }
  }
  return best.rounds;
}
