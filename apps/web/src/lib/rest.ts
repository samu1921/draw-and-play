/** Rest times at the match desk: how long the players of a ready match have been off the table */

/** Below this, a rest counts as short and is marked */
export const SHORT_REST_MINUTES = 10;

/** Whole minutes since `since`; null if the side has not played yet */
export function restMinutes(since: string | null | undefined, now: number): number | null {
  if (!since) return null;
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
}

/**
 * The rest that limits a match: the shorter of both sides. A side that has not played counts as fully rested,
 * so a match where nobody has played yet sorts first.
 */
export function matchRest(sides: readonly ({ restingSince?: string | null } | null)[], now: number): number {
  const rests = sides.map((s) => restMinutes(s?.restingSince, now) ?? Number.POSITIVE_INFINITY);
  return Math.min(...rests);
}
