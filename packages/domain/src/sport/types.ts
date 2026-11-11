/** Side of a match: 0 = first/left, 1 = second/right */
export type Side = 0 | 1;

/** Score of one game (set, leg, … depending on the sport) */
export type GameScore = readonly [number, number];

/** Scoring rules of a competition */
export interface MatchRules {
  /** Games needed to win the match, e.g. 3 = best of 5 */
  gamesToWin: number;
  /** Minimum points to win a game (table tennis: 11) */
  pointsPerGame: number;
  /** Required lead (table tennis: 2) */
  winBy: number;
  /** Hard cap at which the lead no longer applies (badminton: 30). Omit for no cap. */
  pointCap?: number;
}

export type MatchOutcome =
  | { status: 'inProgress'; games: [number, number] }
  | { status: 'finished'; winner: Side; games: [number, number] };

export type GameErrorCode =
  | 'invalidScore'
  | 'noWinner'
  | 'aboveCap'
  | 'gameNotFinished'
  | 'leadTooSmall'
  | 'impossibleScore';

/** Validation errors are codes, not text: the UI translates them. */
export type ResultError =
  | { code: 'empty' }
  | { code: 'invalidToken'; token: string }
  | { code: 'invalidGame'; token: string; reason: GameErrorCode }
  | { code: 'gameAfterMatchEnd'; token: string };

export type ParseResult =
  | { ok: true; games: GameScore[]; outcome: MatchOutcome }
  | { ok: false; error: ResultError };

/** One criterion of the standings order, applied in sequence */
export type RankingCriterion =
  /** Match points (wins) */
  | 'matchPoints'
  /** Record: more wins, and with equal wins fewer losses (table tennis: Plus- and Minuspunkte) */
  | 'record'
  /** Wins minus losses */
  | 'matchDiff'
  /** Game difference */
  | 'gameDiff'
  /** Game ratio */
  | 'gameRatio'
  /** Point difference */
  | 'pointDiff'
  /** Head-to-head: the mini table of the matches among the tied entries, ranked by `Ranking.headToHead` */
  | 'headToHead';

/** How a group table is ordered */
export interface Ranking {
  /** Applied one after the other, each only to the entries still level */
  criteria: RankingCriterion[];
  /** Criteria of the head-to-head mini table; default: `criteria` without head-to-head */
  headToHead?: RankingCriterion[];
  /** When nothing separates: drawing lots, or the order of the draw (default) */
  lastResort?: 'lot' | 'drawOrder';
}

export interface SportProfile {
  /** Stable id; also the i18n key prefix for sport-specific terms (game, point, …) */
  id: string;
  defaultMatchRules: MatchRules;
  /** Group standings order */
  ranking: Ranking;
  /** Rating used for seeding (table tennis: QTTR) */
  ratingName: string;
  /** Parses quick result entry (table tennis: click-TT short notation) */
  parseResult(input: string, rules: MatchRules): ParseResult;
  /** Estimated duration of a match including changeover, in minutes */
  estimateMatchMinutes(rules: MatchRules): number;
}
