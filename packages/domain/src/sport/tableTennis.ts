import { matchOutcome, validateGame } from './rules.js';
import type { GameScore, MatchRules, ParseResult, SportProfile } from './types.js';

/**
 * Short notation as used by click-TT: per game the loser's points, negative when the second side wins.
 * `4` = 11:4, `-5` = 5:11, `-13` = 13:15, `-0` = 0:11. Full scores (`11:4`, `13-11`) are accepted as well.
 */
export function parseShortNotation(input: string, rules: MatchRules): ParseResult {
  const tokens = input
    .trim()
    .split(/[\s,;]+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return { ok: false, error: { code: 'empty' } };

  const games: GameScore[] = [];
  for (const token of tokens) {
    const game = parseToken(token, rules);
    if (!game) return { ok: false, error: { code: 'invalidToken', token } };
    const check = validateGame(game, rules);
    if (!check.ok) return { ok: false, error: { code: 'invalidGame', token, reason: check.error } };
    if (matchOutcome(games, rules).status === 'finished') {
      return { ok: false, error: { code: 'gameAfterMatchEnd', token } };
    }
    games.push(game);
  }
  return { ok: true, games, outcome: matchOutcome(games, rules) };
}

function parseToken(token: string, rules: MatchRules): GameScore | null {
  const full = /^(\d+)[:-](\d+)$/.exec(token);
  if (full) return [Number(full[1]), Number(full[2])];
  const short = /^(-?)(\d+)$/.exec(token);
  if (!short) return null;
  const loser = Number(short[2]);
  const winner = Math.max(rules.pointsPerGame, loser + rules.winBy);
  return short[1] === '-' ? [loser, winner] : [winner, loser];
}

export const tableTennis: SportProfile = {
  id: 'table-tennis',
  defaultMatchRules: { gamesToWin: 3, pointsPerGame: 11, winBy: 2 },
  ranking: ['matchPoints', 'gameDiff', 'headToHead', 'pointDiff'],
  ratingName: 'QTTR',
  parseResult: parseShortNotation,
  // Rule of thumb: about 10 minutes per game needed to win, including warm-up and changeover.
  estimateMatchMinutes: (rules) => rules.gamesToWin * 10,
};
