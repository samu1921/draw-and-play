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
  /** Game difference */
  | 'gameDiff'
  /** Game ratio */
  | 'gameRatio'
  /** Point difference */
  | 'pointDiff'
  /** Head-to-head: re-apply the criteria to the matches among the tied entries only */
  | 'headToHead';

export interface SportProfile {
  /** Stable id; also the i18n key prefix for sport-specific terms (game, point, …) */
  id: string;
  defaultMatchRules: MatchRules;
  /** Group standings order */
  ranking: RankingCriterion[];
  /** Rating used for seeding (table tennis: QTTR) */
  ratingName: string;
  /** Parses quick result entry (table tennis: click-TT short notation) */
  parseResult(input: string, rules: MatchRules): ParseResult;
  /** Estimated duration of a match including changeover, in minutes */
  estimateMatchMinutes(rules: MatchRules): number;
}
