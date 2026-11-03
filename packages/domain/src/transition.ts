import { bracketSize, meetingRound, seedPositions } from './bracket.js';
import type { StandingsRow } from './standings.js';

/** A qualifier from the group stage (group 0-based, rank 1-based) */
export interface Qualifier {
  group: number;
  rank: number;
}

/** Group name: A–Z, numbers from the 27th group on */
export function groupLetter(group: number): string {
  return group < 26 ? String.fromCharCode(65 + group) : String(group + 1);
}

/** Seeding order for "top k per group": all group winners (A1, B1, …), then all runners-up, and so on. */
export function qualifierOrder(groupCount: number, perGroup: number): Qualifier[] {
  const result: Qualifier[] = [];
  for (let rank = 1; rank <= perGroup; rank++) {
    for (let group = 0; group < groupCount; group++) result.push({ group, rank });
  }
  return result;
}

/**
 * Places the qualifiers (in seeding order) into the knockout bracket.
 * The best take the seed positions and receive the byes. Every further qualifier goes to the open position where it
 * would meet an entry from its own group as late as possible (cross-over schema).
 * Result: index into `qualifiers` per bracket position, `null` = bye.
 */
export function placeQualifiers(qualifiers: readonly Qualifier[]): (number | null)[] {
  const n = qualifiers.length;
  const size = bracketSize(n);
  const positions = seedPositions(size);
  const seats: (number | null | undefined)[] = Array.from({ length: size }, () => undefined);
  for (let s = n + 1; s <= size; s++) seats[positions[s - 1]!] = null;

  qualifiers.forEach((q, i) => {
    const preferred = positions[i]!;
    const sameGroup = seats.flatMap((seat, pos) =>
      seat !== undefined && seat !== null && qualifiers[seat]!.group === q.group ? [pos] : [],
    );
    let bestPos = -1;
    let bestScore = -1;
    seats.forEach((seat, pos) => {
      if (seat !== undefined) return;
      const score = Math.min(Number.MAX_SAFE_INTEGER, ...sameGroup.map((other) => meetingRound(pos, other)));
      const better =
        score > bestScore ||
        (score === bestScore && Math.abs(pos - preferred) < Math.abs(bestPos - preferred));
      if (better) {
        bestPos = pos;
        bestScore = score;
      }
    });
    seats[bestPos] = i;
  });
  return seats as (number | null)[];
}

/**
 * Compares standings rows from different (possibly differently sized) groups, e.g. for
 * "the best group winners get a bye" or "the two best third-placed entries".
 * Relative: win ratio, then game difference per match, then point difference per match. Negative = `a` is better.
 */
export function compareAcrossGroups(a: StandingsRow, b: StandingsRow): number {
  const perMatch = (value: number, row: StandingsRow) => (row.played === 0 ? 0 : value / row.played);
  return (
    perMatch(b.won, b) - perMatch(a.won, a) ||
    perMatch(b.gamesWon - b.gamesLost, b) - perMatch(a.gamesWon - a.gamesLost, a) ||
    perMatch(b.pointsWon - b.pointsLost, b) - perMatch(a.pointsWon - a.pointsLost, a)
  );
}
