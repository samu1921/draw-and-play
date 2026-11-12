import { bracketSize, seedPositions } from './bracket.js';
import { groupSizes } from './groupDraw.js';
import type { Side } from './sport/types.js';
import { swissRoundRange } from './swiss.js';
import { BYE, buildKnockout, resolveKnockout, type Knockout, type KnockoutMatch } from './knockout.js';
import { roundRobinSchedule } from './roundRobin.js';
import { groupLetter, placeQualifiers, qualifierOrder } from './transition.js';

/** Which knockout places are played out */
export type PlacementMode = 'none' | 'thirdPlace' | 'all';

/**
 * How the entries eliminated in the group stage play on for their places: all of them in one consolation bracket,
 * or one bracket per group rank (all thirds, all fourths, …), so that nobody ends up behind a lower group rank.
 * A field of three plays everybody against everybody instead of a bracket with a bye.
 */
export type ConsolationMode = 'bracket' | 'perRank';

export interface GroupStageFormat {
  groupCount: number;
  /** Home and away */
  double?: boolean;
}

/** Swiss system: every round pairs entries with the same number of wins; nobody is eliminated */
export interface SwissStageFormat {
  rounds: number;
}

export interface KnockoutStageFormat {
  /** Required after a group stage: top k of every group advance. After a Swiss system: the top k of the table. */
  qualifiersPerGroup?: number;
  placements: PlacementMode;
  /**
   * After a group stage: the best entries of the next group rank (e.g. the two best thirds of three groups) fill
   * the bracket, so that nobody gets a bye.
   */
  fillByes?: boolean;
  /** After a group stage with several groups: the eliminated entries play for the places behind the bracket */
  consolation?: ConsolationMode;
}

/**
 * A competition format as data: a preliminary stage (groups or a Swiss system), a knockout, or both in a row.
 * The planner generates and compares these; they can be changed while a tournament is running.
 */
export interface CompetitionFormat {
  groups?: GroupStageFormat;
  swiss?: SwissStageFormat;
  knockout?: KnockoutStageFormat;
}

export type FormatError =
  | 'noStages'
  | 'conflictingStages'
  | 'tooFewEntries'
  | 'groupsTooSmall'
  | 'invalidRounds'
  | 'missingQualifiers'
  | 'tooManyQualifiers'
  | 'tooFewQualifiers'
  | 'cannotFillByes';

/** Entries of the next group rank that advance to fill the bracket; 0 without `fillByes` or when it is full anyway */
export function bestNextCount(format: CompetitionFormat): number {
  const k = format.knockout?.qualifiersPerGroup;
  if (!format.groups || !format.knockout?.fillByes || k === undefined) return 0;
  const regular = format.groups.groupCount * k;
  return bracketSize(regular) - regular;
}

export function validateFormat(format: CompetitionFormat, entryCount: number): FormatError | null {
  if (!format.groups && !format.swiss && !format.knockout) return 'noStages';
  if (format.groups && format.swiss) return 'conflictingStages';
  if (entryCount < 2) return 'tooFewEntries';
  if (format.swiss) {
    const { rounds } = format.swiss;
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > swissRoundRange(entryCount).max) return 'invalidRounds';
    if (format.knockout) {
      const k = format.knockout.qualifiersPerGroup;
      if (k === undefined || k < 1) return 'missingQualifiers';
      if (k > entryCount) return 'tooManyQualifiers';
      if (k < 2) return 'tooFewQualifiers';
    }
  }
  if (format.groups) {
    const { groupCount } = format.groups;
    if (!Number.isInteger(groupCount) || groupCount < 1 || entryCount < groupCount * 2) return 'groupsTooSmall';
    if (format.knockout) {
      const k = format.knockout.qualifiersPerGroup;
      if (k === undefined || k < 1) return 'missingQualifiers';
      if (k > Math.floor(entryCount / groupCount)) return 'tooManyQualifiers';
      if (groupCount * k < 2) return 'tooFewQualifiers';
      const larger = groupSizes(entryCount, groupCount).filter((size) => size > k).length;
      if (bestNextCount(format) > larger) return 'cannotFillByes';
    }
  }
  return null;
}

/** Places played out for a bracket of `size`, see `KnockoutOptions.playOutPlaces` */
export function playOutPlaces(mode: PlacementMode, size: number): number {
  switch (mode) {
    case 'none':
      return 2;
    case 'thirdPlace':
      return Math.min(4, size);
    case 'all':
      return size;
  }
}

/** Where a side of a match comes from, before the draw or before earlier results are known */
export type SeatRef =
  /** Position in a group (position 0 = group head) */
  | { type: 'groupSeat'; group: number; position: number }
  /** Position in a knockout drawn directly from the entries */
  | { type: 'drawSeat'; position: number }
  /** Side of a Swiss pairing; known once the round is paired */
  | { type: 'swissSeat'; round: number; board: number; side: Side }
  /** Rank after the group stage, e.g. A1; after a Swiss system the rank in its table (group 0) */
  | { type: 'qualifier'; group: number; rank: number }
  /**
   * One of the entries ranked `rank` in their group, compared across all groups: `index` 0 is the best of them.
   * Those that advance to the main bracket, and those in a consolation bracket seeded by this comparison, are
   * seated so that they avoid their own group, not strictly by index; a bye always goes to the best.
   */
  | { type: 'bestNext'; rank: number; index: number }
  | { type: 'winner'; match: string }
  | { type: 'loser'; match: string };

export interface StructureMatch {
  id: string;
  /** `placement`: a match of a consolation field that plays everybody against everybody */
  phase: 'group' | 'swiss' | 'knockout' | 'placement';
  /** Group stage only */
  group?: number;
  /** Group or Swiss round, or knockout round counted from the start of its bracket */
  round: number;
  sides: [SeatRef, SeatRef];
  /** Matches that must be finished before this one can start */
  dependsOn: string[];
  /** Knockout and placement only: id of the bracket (`BracketStage`) or of the field (`PlacementGroup`) */
  stage?: string;
  /** Knockout only: the bracket match, including its place range */
  bracketMatch?: KnockoutMatch;
  /** Knockout: the place range to show, without the places that byes leave empty. Placement: the places of the field. */
  places?: [number, number];
}

/** A knockout bracket of the competition: the main bracket, or a consolation bracket for the lower places */
export interface BracketStage {
  /** `KO` for the main bracket, `C1`, `C2`, … for consolation brackets; prefix of the match ids */
  id: string;
  bracket: Knockout;
  /** Occupant per bracket position; `null` = bye */
  seats: (SeatRef | null)[];
  byes: number;
  /**
   * A consolation bracket with byes: its seats are filled by comparing each group rank across the groups, so that
   * the byes go to the best of them and not to whoever played in the first group.
   */
  seeded?: true;
}

/** A consolation field of three: everybody plays everybody, the table gives the places */
export interface PlacementGroup {
  /** `C1`, `C2`, … counted together with the consolation brackets; prefix of the match ids */
  id: string;
  seats: SeatRef[];
  /** The best of the field takes place `placeOffset + 1` */
  placeOffset: number;
}

export interface CompetitionStructure {
  format: CompetitionFormat;
  entryCount: number;
  /** Empty for a knockout without groups; a Swiss system is one table with all entries */
  groupSizes: number[];
  swiss?: {
    rounds: number;
    /** Matches per round when nobody has withdrawn */
    boards: number;
  };
  /** The main bracket */
  knockout?: BracketStage;
  /** For the entries eliminated in the group stage */
  consolation?: {
    brackets: BracketStage[];
    /** Fields of three, played everybody against everybody */
    groups: PlacementGroup[];
    /** A consolation field with a single entry: it takes its place without playing */
    direct: { seat: SeatRef; place: number }[];
  };
  /** Real matches only: matches decided by byes are left out */
  matches: StructureMatch[];
  /** Fewest and most matches a single entry can play */
  matchesPerEntry: { min: number; max: number };
}

export interface StructureOptions {
  /** When knockout matches may start: after the whole group stage (default) or after the groups they draw from */
  knockoutStart?: 'allGroups' | 'ownGroups';
}

type Range = { min: number; max: number };

export function buildStructure(
  format: CompetitionFormat,
  entryCount: number,
  options: StructureOptions = {},
): CompetitionStructure {
  const error = validateFormat(format, entryCount);
  if (error) throw new Error(`Invalid format: ${error}`);

  const sizes = format.swiss ? [entryCount] : format.groups ? groupSizes(entryCount, format.groups.groupCount) : [];
  const preliminary = format.swiss
    ? buildSwissMatches(entryCount, format.swiss.rounds)
    : format.groups
      ? buildGroupMatches(sizes, format.groups.double ?? false)
      : [];
  /** Matches an entry plays before the knockout */
  const gamesBefore = (size: number): Range => {
    if (format.swiss) return { min: format.swiss.rounds - (entryCount % 2), max: format.swiss.rounds };
    const games = (size - 1) * (format.groups?.double ? 2 : 1);
    return { min: games, max: games };
  };
  const base = {
    format,
    entryCount,
    groupSizes: sizes,
    ...(format.swiss && { swiss: { rounds: format.swiss.rounds, boards: Math.floor(entryCount / 2) } }),
  };

  const ko = format.knockout;
  if (!ko) {
    const ranges = sizes.map(gamesBefore);
    return {
      ...base,
      matches: preliminary,
      matchesPerEntry: { min: Math.min(...ranges.map((r) => r.min)), max: Math.max(...ranges.map((r) => r.max)) },
    };
  }

  // Main bracket: qualifiers from the preliminary stage, or a direct draw of all entries.
  let seats: (SeatRef | null)[];
  if (sizes.length > 0) {
    const k = ko.qualifiersPerGroup!;
    seats = seatBracket([
      ...qualifierOrder(sizes.length, k).map((q): SeatRef => ({ type: 'qualifier', ...q })),
      ...Array.from({ length: bestNextCount(format) }, (_, index): SeatRef => ({ type: 'bestNext', rank: k + 1, index })),
    ]);
  } else {
    const size = bracketSize(entryCount);
    const byePositions = new Set(seedPositions(size).slice(entryCount));
    seats = Array.from({ length: size }, (_, position) => (byePositions.has(position) ? null : { type: 'drawSeat', position }));
  }

  const context: StageContext = { preliminary, swiss: format.swiss !== undefined, knockoutStart: options.knockoutStart ?? 'allGroups' };
  const stage = (id: string, stageSeats: (SeatRef | null)[], placeOffset: number, seeded = false) => {
    const bracket = buildKnockout(stageSeats.length, { playOutPlaces: playOutPlaces(ko.placements, stageSeats.length), placeOffset });
    const built = buildKnockoutMatches(id, bracket, stageSeats, context);
    const byes = stageSeats.filter((s) => s === null).length;
    return { stage: { id, bracket, seats: stageSeats, byes, ...(seeded && { seeded: true as const }) } satisfies BracketStage, ...built };
  };

  const ranges: Range[] = [];
  const add = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max });
  /** Matches before the knockout for whoever takes a seat */
  const before = (seat: SeatRef): Range => {
    if (seat.type === 'qualifier') return gamesBefore(sizes[seat.group]!);
    if (seat.type !== 'bestNext') return { min: 0, max: 0 };
    const possible = sizes.filter((size) => size >= seat.rank).map(gamesBefore);
    return { min: Math.min(...possible.map((r) => r.min)), max: Math.max(...possible.map((r) => r.max)) };
  };
  const collect = (stageSeats: readonly (SeatRef | null)[], pathRange: (position: number) => Range) =>
    stageSeats.forEach((seat, position) => {
      if (seat !== null) ranges.push(add(before(seat), pathRange(position)));
    });

  const main = stage('KO', seats, 0);
  collect(seats, main.pathRange);
  const matches = [...preliminary, ...main.matches];
  let placed = seats.filter((s) => s !== null).length;

  const fields = consolationFields(format, sizes);
  const brackets: BracketStage[] = [];
  const groups: PlacementGroup[] = [];
  const direct: { seat: SeatRef; place: number }[] = [];
  for (const tiers of fields) {
    const id = `C${brackets.length + groups.length + 1}`;
    const count = tiers.reduce((sum, tier) => sum + tier.length, 0);
    if (count === 1) {
      const seat = tiers[0]![0]!;
      direct.push({ seat, place: placed + 1 });
      ranges.push(before(seat));
    } else if (count === 3) {
      // Three would be a bracket in which one sits out and another is done after one match.
      const field = tiers.flat();
      groups.push({ id, seats: field, placeOffset: placed });
      matches.push(...buildPlacementMatches(id, field, placed, context));
      for (const seat of field) ranges.push(add(before(seat), { min: 2, max: 2 }));
    } else {
      const seeded = needsSeeding(tiers);
      const field = seeded ? tiers.flatMap(comparedSeats) : tiers.flat();
      const built = stage(id, seatBracket(field), placed, seeded);
      brackets.push(built.stage);
      matches.push(...built.matches);
      collect(built.stage.seats, built.pathRange);
    }
    placed += count;
  }
  // Entries eliminated in the preliminary stage that do not play on
  if (placed < entryCount) {
    const k = ko.qualifiersPerGroup ?? 0;
    ranges.push(...sizes.filter((size) => size > k).map(gamesBefore));
  }

  return {
    ...base,
    knockout: main.stage,
    ...(fields.length > 0 && { consolation: { brackets, groups, direct } }),
    matches,
    matchesPerEntry: { min: Math.min(...ranges.map((r) => r.min)), max: Math.max(...ranges.map((r) => r.max)) },
  };
}

/** Bracket positions for seats in seeding order: byes for the best, entries of one group as far apart as possible */
function seatBracket(refs: readonly SeatRef[]): (SeatRef | null)[] {
  return placeQualifiers(refs.map((ref) => ({ group: ref.type === 'qualifier' ? ref.group : undefined }))).map((i) =>
    i === null ? null : refs[i]!,
  );
}

/**
 * Whether the byes of a consolation bracket have to be given by performance: they go to the best seeds, and as
 * soon as only some entries of a group rank get one, it must not depend on the group somebody played in.
 */
function needsSeeding(tiers: readonly (readonly SeatRef[])[]): boolean {
  const count = tiers.reduce((sum, tier) => sum + tier.length, 0);
  const byes = bracketSize(count) - count;
  let seeds = 0;
  for (const tier of tiers) {
    if (byes > seeds && byes < seeds + tier.length) return true;
    seeds += tier.length;
  }
  return false;
}

/** The seats of one group rank in the order of its comparison across the groups instead of the order of the groups */
function comparedSeats(tier: readonly SeatRef[]): SeatRef[] {
  return tier.map((seat, index): SeatRef => (seat.type === 'qualifier' ? { type: 'bestNext', rank: seat.rank, index } : seat));
}

/**
 * The fields the eliminated entries play on in, best places first: one field with everybody, or one per group
 * rank. A field lists its seats per group rank, the better ranks first: these are seeded first.
 */
function consolationFields(format: CompetitionFormat, sizes: readonly number[]): SeatRef[][][] {
  const ko = format.knockout;
  if (!format.groups || !ko?.consolation || sizes.length < 2) return [];
  const k = ko.qualifiersPerGroup!;
  const advancing = bestNextCount(format);
  const tiers: SeatRef[][] = [];
  for (let rank = k + 1; rank <= Math.max(...sizes); rank++) {
    const groups = sizes.flatMap((size, group) => (size >= rank ? [group] : []));
    // Which thirds advance is only known after the group stage, so the others are seated by their comparison.
    const tier: SeatRef[] =
      rank === k + 1 && advancing > 0
        ? Array.from({ length: groups.length - advancing }, (_, i): SeatRef => ({ type: 'bestNext', rank, index: advancing + i }))
        : groups.map((group): SeatRef => ({ type: 'qualifier', group, rank }));
    if (tier.length > 0) tiers.push(tier);
  }
  if (tiers.length === 0) return [];
  return ko.consolation === 'perRank' ? tiers.map((tier) => [tier]) : [tiers];
}

/** Matches that have to be finished before the entry on a seat is known */
function seatDependencies(side: SeatRef, context: StageContext): string[] {
  const { preliminary } = context;
  switch (side.type) {
    case 'qualifier': {
      // The last Swiss round already waits for all rounds before it.
      if (context.swiss) {
        const lastRound = Math.max(0, ...preliminary.map((m) => m.round));
        return preliminary.filter((m) => m.round === lastRound).map((m) => m.id);
      }
      return (context.knockoutStart === 'allGroups' ? preliminary : preliminary.filter((m) => m.group === side.group)).map((m) => m.id);
    }
    case 'bestNext':
      // Comparing a rank across the groups needs every group to be finished.
      return preliminary.map((m) => m.id);
    case 'winner':
    case 'loser':
      return [side.match];
    default:
      return [];
  }
}

/** Everybody against everybody in a consolation field; ids `C1-<round>-<match>` */
function buildPlacementMatches(stageId: string, seats: readonly SeatRef[], placeOffset: number, context: StageContext): StructureMatch[] {
  return roundRobinSchedule(seats.length).flatMap((pairs, r) =>
    pairs.map(([a, b], i): StructureMatch => {
      const sides: [SeatRef, SeatRef] = [seats[a]!, seats[b]!];
      return {
        id: `${stageId}-${r + 1}-${i + 1}`,
        phase: 'placement',
        round: r + 1,
        sides,
        dependsOn: [...new Set(sides.flatMap((side) => seatDependencies(side, context)))],
        stage: stageId,
        places: [placeOffset + 1, placeOffset + seats.length],
      };
    }),
  );
}

function buildGroupMatches(sizes: readonly number[], double: boolean): StructureMatch[] {
  const schedules = sizes.map((size) => roundRobinSchedule(size, { double }));
  const rounds = Math.max(0, ...schedules.map((s) => s.length));
  const matches: StructureMatch[] = [];
  // Round by round across all groups, so that list order reflects the intended playing order.
  for (let r = 0; r < rounds; r++) {
    schedules.forEach((schedule, group) => {
      schedule[r]?.forEach(([a, b], i) => {
        matches.push({
          id: `G${groupLetter(group)}-${r + 1}-${i + 1}`,
          phase: 'group',
          group,
          round: r + 1,
          sides: [
            { type: 'groupSeat', group, position: a },
            { type: 'groupSeat', group, position: b },
          ],
          dependsOn: [],
        });
      });
    });
  }
  return matches;
}

/** Id of the match on `board` (0-based) of a Swiss `round` (1-based) */
export function swissMatchId(round: number, board: number): string {
  return `SW-${round}-${board + 1}`;
}

/**
 * A Swiss system has a match slot per board and round. Who plays on a board is only known once the round is
 * paired, which needs all results of the round before; slots left over after withdrawals are never played.
 */
function buildSwissMatches(entryCount: number, rounds: number): StructureMatch[] {
  const boards = Array.from({ length: Math.floor(entryCount / 2) }, (_, board) => board);
  const matches: StructureMatch[] = [];
  for (let round = 1; round <= rounds; round++) {
    const dependsOn = round === 1 ? [] : boards.map((board) => swissMatchId(round - 1, board));
    for (const board of boards) {
      matches.push({
        id: swissMatchId(round, board),
        phase: 'swiss',
        round,
        sides: [
          { type: 'swissSeat', round, board, side: 0 },
          { type: 'swissSeat', round, board, side: 1 },
        ],
        dependsOn,
      });
    }
  }
  return matches;
}

interface StageContext {
  preliminary: readonly StructureMatch[];
  swiss: boolean;
  knockoutStart: 'allGroups' | 'ownGroups';
}

function buildKnockoutMatches(stageId: string, bracket: Knockout, seats: readonly (SeatRef | null)[], context: StageContext) {
  const koId = (bracketId: string) => `${stageId}-${bracketId}`;
  // Resolve with placeholder tokens: every match with a bye on either side is decided without playing.
  const tokens = seats.map((seat, i) => (seat === null ? null : `seat${i}`));
  const structural = resolveKnockout(bracket, tokens, new Map());
  const byId = new Map(bracket.matches.map((m) => [m.id, m]));
  const isReal = (id: string) => {
    const sides = structural.get(id)!.sides;
    return sides[0] !== BYE && sides[1] !== BYE;
  };

  /** Side of a real match, looking through matches decided by byes */
  const resolveSide = (source: KnockoutMatch['sides'][number]): SeatRef => {
    if (source.type === 'seat') return seats[source.index]!;
    if (isReal(source.match)) return { type: source.type, match: koId(source.match) };
    // Only the winner of a bye match can reach a real match: continue with its non-bye side.
    const prior = byId.get(source.match)!;
    const realSide = structural.get(prior.id)!.sides[0] === BYE ? prior.sides[1] : prior.sides[0];
    return resolveSide(realSide);
  };

  // Byes always lose, so the real entries take the best places of the bracket without gaps.
  const lastPlace = bracket.placeOffset + seats.filter((s) => s !== null).length;
  const matches: StructureMatch[] = bracket.matches.filter((m) => isReal(m.id)).map((m) => {
    const sides: [SeatRef, SeatRef] = [resolveSide(m.sides[0]), resolveSide(m.sides[1])];
    const [from, to] = m.places;
    return {
      id: koId(m.id),
      phase: 'knockout',
      round: m.round,
      sides,
      dependsOn: [...new Set(sides.flatMap((side) => seatDependencies(side, context)))],
      stage: stageId,
      bracketMatch: m,
      // The rounds for place 1 keep their size, so a quarterfinal stays one even with byes.
      places: from === 1 ? [from, to] : [from, Math.min(to, lastPlace)],
    };
  });

  // Number of matches an entry plays from a bracket position, depending on its own wins and losses.
  const next = new Map<string, string>();
  for (const m of bracket.matches) {
    for (const s of m.sides) if (s.type !== 'seat') next.set(`${s.type}:${s.match}`, m.id);
  }
  const fromMatch = (id: string | undefined): Range => {
    if (id === undefined) return { min: 0, max: 0 };
    if (!isReal(id)) return fromMatch(next.get(`winner:${id}`));
    const win = fromMatch(next.get(`winner:${id}`));
    const lose = fromMatch(next.get(`loser:${id}`));
    return { min: 1 + Math.min(win.min, lose.min), max: 1 + Math.max(win.max, lose.max) };
  };
  const pathRange = (position: number) =>
    fromMatch(bracket.matches.find((m) => m.sides.some((s) => s.type === 'seat' && s.index === position))?.id);

  return { matches, pathRange };
}
