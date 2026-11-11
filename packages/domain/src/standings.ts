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

/** A score as "for:against": wins:losses, games won:lost or points won:lost, depending on the criterion */
export type ScorePair = readonly [number, number];

/**
 * One step of breaking a tie. Entries are listed in the order they end up in.
 * `among` is set inside a head-to-head comparison: only the matches among these entries count.
 */
export type TieBreakStep =
  | {
      type: 'criterion';
      criterion: Exclude<RankingCriterion, 'headToHead'>;
      entries: EntryId[];
      /** Per entry (aligned with `entries`): the score the criterion is computed from */
      scores: ScorePair[];
      /** Outcome: entries in the same class are still level after this step */
      classes: EntryId[][];
      among?: EntryId[];
    }
  /** Head-to-head: the next steps (with `among`) look only at the matches among `entries`. Skipped if those are all matches. */
  | { type: 'headToHead'; entries: EntryId[]; skipped: boolean }
  /** Level on every criterion: the order of the draw (the group's seeding order) decides */
  | { type: 'drawOrder'; entries: EntryId[] };

/** Entries level on the first criterion and how they were separated */
export interface TieBreak {
  criterion: RankingCriterion;
  /** In final order */
  entries: EntryId[];
  scores: ScorePair[];
  steps: TieBreakStep[];
}

export interface StandingsExplanation {
  rows: StandingsRow[];
  tieBreaks: TieBreak[];
}

/**
 * Group standings. `entries` is the draw order, which decides when entries are tied on every criterion.
 * Pass finished matches only.
 */
export function computeStandings(
  entries: readonly EntryId[],
  matches: readonly StandingsMatch[],
  criteria: readonly RankingCriterion[],
): StandingsRow[] {
  return explainStandings(entries, matches, criteria).rows;
}

/**
 * Group standings with every step that broke a tie, for showing how the order came about.
 * The order comes from the same code path as `computeStandings`, so the explanation always matches it.
 */
export function explainStandings(
  entries: readonly EntryId[],
  matches: readonly StandingsMatch[],
  criteria: readonly RankingCriterion[],
): StandingsExplanation {
  const stats = tally(entries, matches);
  const tieBreaks: TieBreak[] = [];
  // Ties are opened from the top of the table down, so `tieBreaks` is in table order.
  const miniTable = criteria.filter((c) => c !== 'headToHead');
  const ordered = rankIds([...entries], matches, criteria, stats, { root: tieBreaks }, miniTable).flat();
  return { rows: ordered.map((id, i) => ({ ...stats.get(id)!, rank: i + 1 })), tieBreaks };
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

/**
 * Where tie-break steps go: at the root, each class level on the first criterion opens its own `TieBreak`;
 * below, steps are appended to the tie being broken. `among` marks a head-to-head comparison.
 */
type Trace = { root: TieBreak[] } | { steps: TieBreakStep[]; among?: EntryId[] };

/** Orders `ids` into tie classes; entries within a class cannot be separated by the criteria. */
function rankIds(
  ids: EntryId[],
  matches: readonly StandingsMatch[],
  criteria: readonly RankingCriterion[],
  stats: Map<EntryId, Stats>,
  trace: Trace,
  /** Criteria of the head-to-head mini table: all criteria of the sport except head-to-head itself */
  miniTable: readonly RankingCriterion[],
): EntryId[][] {
  const [criterion, ...rest] = criteria;
  if (ids.length <= 1) return [ids];
  if (criterion === undefined) {
    // Level on everything: the draw order stands. Inside a head-to-head the outer criteria still follow.
    if ('steps' in trace && !trace.among) trace.steps.push({ type: 'drawOrder', entries: ids });
    return [ids];
  }

  if (criterion === 'headToHead') {
    const members = new Set(ids);
    const among = matches.filter((m) => members.has(m.a) && members.has(m.b));
    // If the mini table covers every match, head-to-head adds nothing new.
    const skipped = among.length === matches.length;
    const step: TieBreakStep = { type: 'headToHead', entries: ids, skipped };
    if ('steps' in trace) trace.steps.push(step);
    const result = skipped
      ? rankIds(ids, matches, rest, stats, trace, miniTable)
      : (() => {
          const steps = 'steps' in trace ? trace.steps : [];
          const classes = rankIds(ids, among, miniTable, tally(ids, among), { steps, among: ids }, miniTable);
          return classes.flatMap((cls) => rankIds(cls, matches, rest, stats, 'steps' in trace ? { steps } : trace, miniTable));
        })();
    step.entries = result.flat();
    return result;
  }

  const value = (id: EntryId) => criterionValue(criterion, stats.get(id)!);
  const groups = new Map<number, EntryId[]>();
  for (const id of ids) {
    const v = value(id);
    groups.set(v, [...(groups.get(v) ?? []), id]);
  }
  const classes = [...groups.entries()].sort(([a], [b]) => b - a).map(([, group]) => group);
  const score = (id: EntryId) => scoreOf(criterion, stats.get(id)!);

  if ('root' in trace) {
    return classes.flatMap((group) => {
      if (group.length <= 1) return [group];
      const tie: TieBreak = { criterion, entries: group, scores: [], steps: [] };
      trace.root.push(tie);
      const result = rankIds(group, matches, rest, stats, { steps: tie.steps }, miniTable);
      tie.entries = result.flat();
      tie.scores = tie.entries.map(score);
      return result;
    });
  }

  const step: Extract<TieBreakStep, { type: 'criterion' }> = {
    type: 'criterion',
    criterion,
    entries: [],
    scores: [],
    classes,
    ...(trace.among && { among: trace.among }),
  };
  trace.steps.push(step);
  const results = classes.map((group) => rankIds(group, matches, rest, stats, trace, miniTable));
  // Within each class, list the entries in the order the later steps put them in.
  step.classes = results.map((r) => r.flat());
  step.entries = step.classes.flat();
  step.scores = step.entries.map(score);
  return results.flat();
}

function scoreOf(criterion: Exclude<RankingCriterion, 'headToHead'>, s: Stats): ScorePair {
  switch (criterion) {
    case 'matchPoints':
      return [s.won, s.lost];
    case 'gameDiff':
    case 'gameRatio':
      return [s.gamesWon, s.gamesLost];
    case 'pointDiff':
      return [s.pointsWon, s.pointsLost];
  }
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
