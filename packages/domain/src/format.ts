import { bracketSize, seedPositions } from './bracket.js';
import { groupSizes } from './groupDraw.js';
import { BYE, buildKnockout, resolveKnockout, type Knockout, type KnockoutMatch } from './knockout.js';
import { roundRobinSchedule } from './roundRobin.js';
import { groupLetter, placeQualifiers, qualifierOrder } from './transition.js';

/** Which knockout places are played out */
export type PlacementMode = 'none' | 'thirdPlace' | 'all';

export interface GroupStageFormat {
  groupCount: number;
  /** Home and away */
  double?: boolean;
}

export interface KnockoutStageFormat {
  /** Required after a group stage: top k of every group advance */
  qualifiersPerGroup?: number;
  placements: PlacementMode;
}

/**
 * A competition format as data: groups only, knockout only, or groups followed by a knockout.
 * The planner generates and compares these; they can be changed while a tournament is running.
 */
export interface CompetitionFormat {
  groups?: GroupStageFormat;
  knockout?: KnockoutStageFormat;
}

export type FormatError =
  | 'noStages'
  | 'tooFewEntries'
  | 'groupsTooSmall'
  | 'missingQualifiers'
  | 'tooManyQualifiers'
  | 'tooFewQualifiers';

export function validateFormat(format: CompetitionFormat, entryCount: number): FormatError | null {
  if (!format.groups && !format.knockout) return 'noStages';
  if (entryCount < 2) return 'tooFewEntries';
  if (format.groups) {
    const { groupCount } = format.groups;
    if (!Number.isInteger(groupCount) || groupCount < 1 || entryCount < groupCount * 2) return 'groupsTooSmall';
    if (format.knockout) {
      const k = format.knockout.qualifiersPerGroup;
      if (k === undefined || k < 1) return 'missingQualifiers';
      if (k > Math.floor(entryCount / groupCount)) return 'tooManyQualifiers';
      if (groupCount * k < 2) return 'tooFewQualifiers';
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
  /** Group rank after the group stage, e.g. A1 */
  | { type: 'qualifier'; group: number; rank: number }
  | { type: 'winner'; match: string }
  | { type: 'loser'; match: string };

export interface StructureMatch {
  id: string;
  phase: 'group' | 'knockout';
  /** Group stage only */
  group?: number;
  /** Group round, or knockout round counted from the start of the bracket */
  round: number;
  sides: [SeatRef, SeatRef];
  /** Matches that must be finished before this one can start */
  dependsOn: string[];
  /** Knockout only: the bracket match, including its place range */
  bracketMatch?: KnockoutMatch;
}

export interface CompetitionStructure {
  format: CompetitionFormat;
  entryCount: number;
  /** Empty for a knockout without groups */
  groupSizes: number[];
  knockout?: {
    bracket: Knockout;
    /** Occupant per bracket position; `null` = bye */
    seats: (SeatRef | null)[];
    byes: number;
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

export function buildStructure(
  format: CompetitionFormat,
  entryCount: number,
  options: StructureOptions = {},
): CompetitionStructure {
  const error = validateFormat(format, entryCount);
  if (error) throw new Error(`Invalid format: ${error}`);

  const sizes = format.groups ? groupSizes(entryCount, format.groups.groupCount) : [];
  const groupMatches = format.groups ? buildGroupMatches(sizes, format.groups.double ?? false) : [];
  const gamesPerGroupEntry = (size: number) => (size - 1) * (format.groups?.double ? 2 : 1);

  if (!format.knockout) {
    const counts = sizes.map(gamesPerGroupEntry);
    return {
      format,
      entryCount,
      groupSizes: sizes,
      matches: groupMatches,
      matchesPerEntry: { min: Math.min(...counts), max: Math.max(...counts) },
    };
  }

  // Bracket seats: qualifiers from the groups, or a direct draw of all entries.
  let seats: (SeatRef | null)[];
  if (format.groups) {
    const qualifiers = qualifierOrder(sizes.length, format.knockout.qualifiersPerGroup!);
    seats = placeQualifiers(qualifiers).map((i) => (i === null ? null : { type: 'qualifier', ...qualifiers[i]! }));
  } else {
    const size = bracketSize(entryCount);
    const byePositions = new Set(seedPositions(size).slice(entryCount));
    seats = Array.from({ length: size }, (_, position) => (byePositions.has(position) ? null : { type: 'drawSeat', position }));
  }

  const bracket = buildKnockout(seats.length, { playOutPlaces: playOutPlaces(format.knockout.placements, seats.length) });
  const knockout = buildKnockoutMatches(bracket, seats, groupMatches, options.knockoutStart ?? 'allGroups');

  return {
    format,
    entryCount,
    groupSizes: sizes,
    knockout: { bracket, seats, byes: seats.filter((s) => s === null).length },
    matches: [...groupMatches, ...knockout.matches],
    matchesPerEntry: entryRange(sizes, gamesPerGroupEntry, seats, knockout.pathRange),
  };
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

function buildKnockoutMatches(
  bracket: Knockout,
  seats: readonly (SeatRef | null)[],
  groupMatches: readonly StructureMatch[],
  knockoutStart: 'allGroups' | 'ownGroups',
) {
  const koId = (bracketId: string) => `KO-${bracketId}`;
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

  const allGroupIds = groupMatches.map((m) => m.id);
  const depsOf = (side: SeatRef): string[] => {
    switch (side.type) {
      case 'qualifier':
        return knockoutStart === 'allGroups'
          ? allGroupIds
          : groupMatches.filter((m) => m.group === side.group).map((m) => m.id);
      case 'winner':
      case 'loser':
        return [side.match];
      default:
        return [];
    }
  };

  const matches: StructureMatch[] = bracket.matches.filter((m) => isReal(m.id)).map((m) => {
    const sides: [SeatRef, SeatRef] = [resolveSide(m.sides[0]), resolveSide(m.sides[1])];
    return {
      id: koId(m.id),
      phase: 'knockout',
      round: m.round,
      sides,
      dependsOn: [...new Set([...depsOf(sides[0]), ...depsOf(sides[1])])],
      bracketMatch: m,
    };
  });

  // Number of matches an entry plays from a bracket position, depending on its own wins and losses.
  const next = new Map<string, string>();
  for (const m of bracket.matches) {
    for (const s of m.sides) if (s.type !== 'seat') next.set(`${s.type}:${s.match}`, m.id);
  }
  const fromMatch = (id: string | undefined): { min: number; max: number } => {
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

function entryRange(
  sizes: readonly number[],
  gamesPerGroupEntry: (size: number) => number,
  seats: readonly (SeatRef | null)[],
  pathRange: (position: number) => { min: number; max: number },
): { min: number; max: number } {
  const ranges: { min: number; max: number }[] = [];
  const qualifiedPerGroup = new Map<number, number>();
  seats.forEach((seat, position) => {
    if (seat === null) return;
    const ko = pathRange(position);
    const before = seat.type === 'qualifier' ? gamesPerGroupEntry(sizes[seat.group]!) : 0;
    if (seat.type === 'qualifier') qualifiedPerGroup.set(seat.group, (qualifiedPerGroup.get(seat.group) ?? 0) + 1);
    ranges.push({ min: before + ko.min, max: before + ko.max });
  });
  // Entries eliminated in the group stage
  sizes.forEach((size, group) => {
    if (size > (qualifiedPerGroup.get(group) ?? 0)) {
      const n = gamesPerGroupEntry(size);
      ranges.push({ min: n, max: n });
    }
  });
  return { min: Math.min(...ranges.map((r) => r.min)), max: Math.max(...ranges.map((r) => r.max)) };
}
