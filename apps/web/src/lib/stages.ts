import type { CompetitionStateInfo, MatchInfo } from './api.js';

/** A knockout bracket as it is shown: its rounds as columns, the matches for the lower places as a list */
export interface BracketView {
  /** `KO` for the main bracket, `C1`, `C2`, … for consolation brackets */
  stage: string;
  /** Places the bracket plays for, e.g. [9, 12] */
  places: [number, number];
  /** Rounds for the best place of the bracket, first round first */
  rounds: MatchInfo[][];
  placementMatches: MatchInfo[];
}

const stageOf = (m: MatchInfo) => m.stage ?? 'KO';

/** The brackets of a competition, the main bracket first */
export function bracketViews(matches: readonly MatchInfo[]): BracketView[] {
  const knockout = matches.filter((m) => m.phase === 'knockout');
  return [...new Set(knockout.map(stageOf))].map((stage) => {
    const own = knockout.filter((m) => stageOf(m) === stage);
    const first = Math.min(...own.map((m) => m.places?.[0] ?? 1));
    const last = Math.max(...own.map((m) => m.places?.[1] ?? first));
    const top = own.filter((m) => (m.places?.[0] ?? 1) === first);
    const rounds = [...new Set(top.map((m) => m.round))].sort((a, b) => a - b);
    return {
      stage,
      places: [first, last],
      rounds: rounds.map((round) => top.filter((m) => m.round === round)),
      placementMatches: own.filter((m) => (m.places?.[0] ?? 1) > first),
    };
  });
}

/** A consolation field of three: its table and its matches */
export interface PlacementGroupView {
  stage: string;
  places: [number, number];
  group: NonNullable<CompetitionStateInfo['placementGroups']>[number];
  matches: MatchInfo[];
}

export function placementGroupViews(state: Pick<CompetitionStateInfo, 'placementGroups' | 'matches'>): PlacementGroupView[] {
  return (state.placementGroups ?? []).map((group) => ({
    stage: group.stage,
    places: group.places,
    group,
    matches: state.matches.filter((m) => m.phase === 'placement' && m.stage === group.stage),
  }));
}

/** One round of a Swiss system: its pairings once it is paired, and who sits out */
export interface SwissRoundView {
  round: number;
  /** false while the round before is still running */
  paired: boolean;
  matches: MatchInfo[];
  /** Entry with a bye */
  bye: string | null;
}

export function swissRoundViews(state: Pick<CompetitionStateInfo, 'swiss' | 'matches'>): SwissRoundView[] {
  const swiss = state.swiss;
  if (!swiss) return [];
  return Array.from({ length: swiss.rounds }, (_, i) => {
    const round = i + 1;
    const paired = swiss.paired.find((p) => p.round === round);
    return {
      round,
      paired: paired !== undefined,
      matches: paired ? state.matches.filter((m) => m.phase === 'swiss' && m.round === round) : [],
      bye: paired?.bye ?? null,
    };
  });
}

/** The round that is being played: the last one that is paired */
export function currentSwissRound(state: Pick<CompetitionStateInfo, 'swiss' | 'matches'>): SwissRoundView | undefined {
  return swissRoundViews(state).filter((r) => r.paired).at(-1);
}

/** One round of doubles with rotating partners: its matches and who sits out */
export interface RotationRoundView {
  round: number;
  matches: MatchInfo[];
  /** Players without a match in this round */
  resting: string[];
  /** Every match of the round is finished */
  complete: boolean;
}

export function rotationRoundViews(state: Pick<CompetitionStateInfo, 'groups' | 'matches'>): RotationRoundView[] {
  const own = state.matches.filter((m) => m.phase === 'rotation');
  const players = state.groups[0]?.entries ?? [];
  return [...new Set(own.map((m) => m.round))]
    .sort((a, b) => a - b)
    .map((round) => {
      const matches = own.filter((m) => m.round === round);
      const playing = new Set(matches.flatMap((m) => [...m.sides, ...(m.partners ?? [])]));
      return { round, matches, resting: players.filter((id) => !playing.has(id)), complete: matches.every((m) => m.status === 'finished') };
    });
}
