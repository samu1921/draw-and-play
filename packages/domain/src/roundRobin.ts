/** Pairing of two group positions (0-based, position 0 = top seed) */
export type Pairing = [number, number];

export interface RoundRobinOptions {
  /** Play every pairing twice, sides swapped in the second leg */
  double?: boolean;
}

/**
 * Round-robin schedule using the circle method. Each round contains every position at most once.
 * The pairing of the two top seeds (positions 0 and 1) is placed in the last round.
 */
export function roundRobinSchedule(size: number, options: RoundRobinOptions = {}): Pairing[][] {
  if (size < 2) return [];
  const n = size % 2 === 0 ? size : size + 1; // odd size: a dummy position marks the bye
  const circle = Array.from({ length: n }, (_, i) => i);
  const rounds: Pairing[][] = [];

  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i]!;
      const b = circle[n - 1 - i]!;
      if (a === size || b === size) continue;
      round.push(a < b ? [a, b] : [b, a]);
    }
    round.sort((x, y) => x[0] - y[0]);
    rounds.push(round);
    circle.splice(1, 0, circle.pop()!);
  }

  const topDuel = rounds.findIndex((round) => round.some(([a, b]) => a === 0 && b === 1));
  rounds.push(...rounds.splice(topDuel, 1));

  if (options.double) {
    return [...rounds, ...rounds.map((round) => round.map(([a, b]): Pairing => [b, a]))];
  }
  return rounds;
}

/** Moves rounds with same-club duels to the front (stable), so club mates play each other early. */
export function clubDuelsFirst(rounds: Pairing[][], clubOf: (position: number) => string | undefined): Pairing[][] {
  const duels = (round: Pairing[]) =>
    round.filter(([a, b]) => {
      const club = clubOf(a);
      return club !== undefined && club === clubOf(b);
    }).length;
  return rounds
    .map((round, index) => ({ round, index, duels: duels(round) }))
    .sort((x, y) => y.duels - x.duels || x.index - y.index)
    .map(({ round }) => round);
}
