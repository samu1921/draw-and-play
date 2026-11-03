import type { GameErrorCode, GameScore, MatchOutcome, MatchRules, Side } from './types.js';

export type GameValidation = { ok: true; winner: Side } | { ok: false; error: GameErrorCode };

/** Checks one game against the rules (minimum points, lead, optional cap). */
export function validateGame([a, b]: GameScore, rules: MatchRules): GameValidation {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { ok: false, error: 'invalidScore' };
  }
  if (a === b) return { ok: false, error: 'noWinner' };

  const winner: Side = a > b ? 0 : 1;
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const atCap = rules.pointCap !== undefined && high === rules.pointCap;

  if (rules.pointCap !== undefined && high > rules.pointCap) return { ok: false, error: 'aboveCap' };
  if (high < rules.pointsPerGame) return { ok: false, error: 'gameNotFinished' };
  if (!atCap && high - low < rules.winBy) return { ok: false, error: 'leadTooSmall' };
  // Past the regular points, a game ends exactly when the required lead is reached.
  if (!atCap && high > rules.pointsPerGame && high - low !== rules.winBy) {
    return { ok: false, error: 'impossibleScore' };
  }
  return { ok: true, winner };
}

/** Counts games won and detects the end of the match. Games must already be valid. */
export function matchOutcome(games: readonly GameScore[], rules: MatchRules): MatchOutcome {
  const won: [number, number] = [0, 0];
  for (const [a, b] of games) {
    won[a > b ? 0 : 1]++;
  }
  if (won[0] >= rules.gamesToWin) return { status: 'finished', winner: 0, games: won };
  if (won[1] >= rules.gamesToWin) return { status: 'finished', winner: 1, games: won };
  return { status: 'inProgress', games: won };
}
