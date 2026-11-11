import type { GameScore, RankingCriterion, Side } from './sport/types.js';

export type EntryId = string;

export interface MatchResult {
  winner: Side;
  games: readonly GameScore[];
  /** Walkover: counts as a win/loss, but without games and points */
  walkover?: boolean;
}

export interface StandingsMatch {
  a: EntryId;
  b: EntryId;
  result: MatchResult;
}

export interface StandingsRow {
  entryId: EntryId;
  rank: number;
  played: number;
  won: number;
  lost: number;
  matchPoints: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
}

type Stats = Omit<StandingsRow, 'rank'>;

/**
 * Group standings. `entries` is the draw order, which decides when entries are tied on every criterion.
 * Pass finished matches only.
 */
export function computeStandings(
  entries: readonly EntryId[],
  matches: readonly StandingsMatch[],
  criteria: readonly RankingCriterion[],
): StandingsRow[] {
  const stats = tally(entries, matches);
  // The head-to-head mini table uses all criteria of the sport except head-to-head itself.
  const miniTable = criteria.filter((c) => c !== 'headToHead');
  const ordered = rankIds([...entries], matches, criteria, stats, miniTable).flat();
  return ordered.map((id, i) => ({ ...stats.get(id)!, rank: i + 1 }));
}

function tally(entries: readonly EntryId[], matches: readonly StandingsMatch[]): Map<EntryId, Stats> {
  const stats = new Map<EntryId, Stats>(
    entries.map((entryId) => [
      entryId,
      { entryId, played: 0, won: 0, lost: 0, matchPoints: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0 },
    ]),
  );
  for (const { a, b, result } of matches) {
    const sides = [stats.get(a), stats.get(b)] as const;
    sides.forEach((s, side) => {
      if (!s) return;
      const won = result.winner === side;
      s.played++;
      if (won) {
        s.won++;
        s.matchPoints++;
      } else {
        s.lost++;
      }
      if (result.walkover) return;
      for (const game of result.games) {
        const own = game[side]!;
        const other = game[1 - side]!;
        if (own > other) s.gamesWon++;
        else s.gamesLost++;
        s.pointsWon += own;
        s.pointsLost += other;
      }
    });
  }
  return stats;
}

/** Orders `ids` into tie classes; entries within a class cannot be separated by the criteria. */
function rankIds(
  ids: EntryId[],
  matches: readonly StandingsMatch[],
  criteria: readonly RankingCriterion[],
  stats: Map<EntryId, Stats>,
  miniTable: readonly RankingCriterion[],
): EntryId[][] {
  const [criterion, ...rest] = criteria;
  if (ids.length <= 1 || criterion === undefined) return [ids];

  if (criterion === 'headToHead') {
    const members = new Set(ids);
    const among = matches.filter((m) => members.has(m.a) && members.has(m.b));
    // If the mini table covers every match, head-to-head adds nothing new.
    if (among.length === matches.length) return rankIds(ids, matches, rest, stats, miniTable);
    const classes = rankIds(ids, among, miniTable, tally(ids, among), miniTable);
    return classes.flatMap((cls) => rankIds(cls, matches, rest, stats, miniTable));
  }

  const value = (id: EntryId) => criterionValue(criterion, stats.get(id)!);
  const groups = new Map<number, EntryId[]>();
  for (const id of ids) {
    const v = value(id);
    groups.set(v, [...(groups.get(v) ?? []), id]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .flatMap(([, group]) => rankIds(group, matches, rest, stats, miniTable));
}

function criterionValue(criterion: Exclude<RankingCriterion, 'headToHead'>, s: Stats): number {
  switch (criterion) {
    case 'matchPoints':
      return s.matchPoints;
    case 'gameDiff':
      return s.gamesWon - s.gamesLost;
    case 'gameRatio':
      return s.gamesLost === 0 ? (s.gamesWon === 0 ? 0 : Number.POSITIVE_INFINITY) : s.gamesWon / s.gamesLost;
    case 'pointDiff':
      return s.pointsWon - s.pointsLost;
  }
}
