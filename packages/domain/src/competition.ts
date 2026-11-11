import { drawKnockout } from './bracket.js';
import type { CompetitionStructure, SeatRef, StructureMatch } from './format.js';
import { drawGroups, rankForSeeding, type DrawEntry, type SeedPlacement } from './groupDraw.js';
import { knockoutPlacements, resolveKnockout, type Placement } from './knockout.js';
import type { Rng } from './rng.js';
import type { Seed } from './rng.js';
import type { Side } from './sport/types.js';
import { explainStandings, type EntryId, type MatchResult, type RankingInput, type StandingsMatch, type StandingsRow, type TieBreak } from './standings.js';

/** Result of the draw: entries per group position, or per knockout position (`null` = bye) */
export type Draw =
  | { type: 'groups'; groups: EntryId[][] }
  | { type: 'knockout'; seats: (EntryId | null)[] };

export type DrawError = 'wrongEntryCount' | 'wrongDrawType' | 'wrongGroupSizes' | 'wrongSeatCount' | 'byeMismatch' | 'duplicateEntry';

export function validateDraw(structure: CompetitionStructure, draw: Draw): DrawError | null {
  if (structure.groupSizes.length > 0) {
    if (draw.type !== 'groups') return 'wrongDrawType';
    const sizes = draw.groups.map((g) => g.length);
    if (sizes.length !== structure.groupSizes.length || sizes.some((s, i) => s !== structure.groupSizes[i])) return 'wrongGroupSizes';
  } else {
    if (draw.type !== 'knockout') return 'wrongDrawType';
    const expected = structure.knockout!.seats;
    if (draw.seats.length !== expected.length) return 'wrongSeatCount';
    if (draw.seats.some((s, i) => (s === null) !== (expected[i] === null))) return 'byeMismatch';
  }
  const ids = draw.type === 'groups' ? draw.groups.flat() : draw.seats.filter((s): s is EntryId => s !== null);
  return new Set(ids).size === ids.length ? null : 'duplicateEntry';
}

export interface CompetitionDrawOptions {
  /** Number of seeded entries: default the group heads, or a quarter of the bracket (at least 2) in a knockout */
  seedCount?: number;
  /**
   * Groups (default fixed): see `drawGroups`.
   * Knockout (default drawn): seeds 1 and 2 are always fixed; drawn lets seeds 3/4, 5–8, … be drawn among their tier.
   */
  seedPlacement?: SeedPlacement;
}

/** Draws the entries into the structure: groups by seeding list with club separation, or a seeded knockout. */
export function drawForStructure(
  structure: CompetitionStructure,
  entries: readonly DrawEntry[],
  rng: Rng,
  options: CompetitionDrawOptions = {},
): Draw {
  if (entries.length !== structure.entryCount) {
    throw new Error(`Draw needs ${structure.entryCount} entries, got ${entries.length}`);
  }
  if (structure.groupSizes.length > 0) {
    return {
      type: 'groups',
      groups: drawGroups(entries, {
        groupCount: structure.groupSizes.length,
        rng,
        ...(options.seedCount !== undefined && { seedCount: options.seedCount }),
        ...(options.seedPlacement !== undefined && { seedPlacement: options.seedPlacement }),
      }),
    };
  }
  const size = structure.knockout!.seats.length;
  const ranked = rankForSeeding(entries).map((e) => e.id);
  return {
    type: 'knockout',
    seats: drawKnockout(ranked, {
      seedCount: options.seedCount ?? Math.max(2, size / 4),
      rng,
      drawSeedTiers: (options.seedPlacement ?? 'drawn') === 'drawn',
    }),
  };
}

export interface ResolvedMatch {
  id: string;
  phase: StructureMatch['phase'];
  group?: number;
  round: number;
  /** `null` while the side depends on unfinished matches */
  sides: [EntryId | null, EntryId | null];
  /** pending = a side is not known yet, ready = can be played, finished = result recorded */
  status: 'pending' | 'ready' | 'finished';
  result?: MatchResult;
  winner?: EntryId;
  loser?: EntryId;
  /** Decided as a walkover because a side withdrew; there is no recorded result behind it */
  withdrawal?: true;
}

export interface GroupState {
  group: number;
  entries: EntryId[];
  standings: StandingsRow[];
  /** How entries level on wins were separated, for showing the calculation */
  tieBreaks: TieBreak[];
  /** All matches of the group are finished, so the ranks are final */
  complete: boolean;
}

export interface CompetitionState {
  matches: ResolvedMatch[];
  groups: GroupState[];
  /** Places known so far; shared places for the group stage and unplayed placement rounds */
  placements: Placement[];
  finished: boolean;
}

export interface ResolveOptions {
  /**
   * Entries that withdrew after the draw. Each of their matches without a recorded result is a walkover for the
   * opponent as soon as both sides are known, in the groups and in every later knockout round. If both sides
   * withdrew, the first side goes through, so the bracket can still be resolved.
   * Losing a match by a recorded walkover (not turning up) counts as withdrawing from then on.
   * In the group table, all matches of a withdrawn entry are annulled and it is ranked last (DTTB WO D 7.9).
   */
  withdrawn?: ReadonlySet<EntryId>;
  /** Seed for drawing lots in finished groups, see `StandingsOptions` (e.g. the seed of the draw) */
  lotSeed?: Seed;
}

/**
 * The live state of a competition: who plays in which match, group standings, knockout progress and places.
 * `results` is keyed by structure match id; results for matches whose sides are not known yet are ignored.
 */
export function resolveCompetition(
  structure: CompetitionStructure,
  draw: Draw,
  results: ReadonlyMap<string, MatchResult>,
  ranking: RankingInput,
  options: ResolveOptions = {},
): CompetitionState {
  const withdrawn = new Set<EntryId>(options.withdrawn ?? []);
  // Not turning up to a group match ends the competition for that entry, including its earlier and later group
  // matches; the group sides are known from the draw alone, so these are found up front.
  if (draw.type === 'groups') {
    for (const m of structure.matches) {
      const recorded = results.get(m.id);
      if (m.phase !== 'group' || !recorded?.walkover) continue;
      const loser = m.sides[(1 - recorded.winner) as Side]!;
      if (loser.type === 'groupSeat') {
        const id = draw.groups[loser.group]?.[loser.position];
        if (id) withdrawn.add(id);
      }
    }
  }
  const resolved = new Map<string, ResolvedMatch>();
  const groupStates: GroupState[] = [];

  const seatEntry = (seat: SeatRef): EntryId | null => {
    switch (seat.type) {
      case 'groupSeat':
        return draw.type === 'groups' ? (draw.groups[seat.group]?.[seat.position] ?? null) : null;
      case 'drawSeat':
        return draw.type === 'knockout' ? (draw.seats[seat.position] ?? null) : null;
      case 'qualifier': {
        const group = groupStates[seat.group];
        return group?.complete ? (group.standings[seat.rank - 1]?.entryId ?? null) : null;
      }
      case 'winner':
        return resolved.get(seat.match)?.winner ?? null;
      case 'loser':
        return resolved.get(seat.match)?.loser ?? null;
    }
  };

  const resolveMatch = (m: StructureMatch) => {
    const sides: [EntryId | null, EntryId | null] = [seatEntry(m.sides[0]), seatEntry(m.sides[1])];
    const base = { id: m.id, phase: m.phase, round: m.round, sides, ...(m.group !== undefined && { group: m.group }) };
    const recorded = results.get(m.id);
    let match: ResolvedMatch;
    if (sides[0] === null || sides[1] === null) match = { ...base, status: 'pending' };
    else if (recorded) {
      match = { ...base, status: 'finished', result: recorded, winner: sides[recorded.winner]!, loser: sides[(1 - recorded.winner) as Side]! };
      // A knockout walkover: the loser plays no further matches, e.g. no match for third place
      if (recorded.walkover) withdrawn.add(match.loser!);
    }
    else if (withdrawn.has(sides[0]) || withdrawn.has(sides[1])) {
      const winner: Side = withdrawn.has(sides[0]) && !withdrawn.has(sides[1]) ? 1 : 0;
      const result: MatchResult = { winner, games: [], walkover: true };
      match = { ...base, status: 'finished', result, winner: sides[winner]!, loser: sides[(1 - winner) as Side]!, withdrawal: true };
    } else match = { ...base, status: 'ready' };
    resolved.set(m.id, match);
    return match;
  };

  // Group stage first: knockout seats need the final group ranks.
  const groupMatches = structure.matches.filter((m) => m.phase === 'group').map(resolveMatch);
  structure.groupSizes.forEach((_, group) => {
    const entries = draw.type === 'groups' ? (draw.groups[group] ?? []) : [];
    const own = groupMatches.filter((m) => m.group === group);
    // Matches of withdrawn entries are annulled for the table; the withdrawn are ranked last, in draw order.
    const finished: StandingsMatch[] = own
      .filter((m) => m.status === 'finished' && !withdrawn.has(m.sides[0]!) && !withdrawn.has(m.sides[1]!))
      .map((m) => ({ a: m.sides[0]!, b: m.sides[1]!, result: m.result! }));
    const active = entries.filter((id) => !withdrawn.has(id));
    const out = entries.filter((id) => withdrawn.has(id));
    const complete = own.every((m) => m.status === 'finished');
    // Lots decide the final order only: while the group runs, the draw order stands in provisionally.
    const lotSeed = options.lotSeed !== undefined && complete ? { lotSeed: `${options.lotSeed}:${group}` } : {};
    const { rows, tieBreaks } = explainStandings(active, finished, ranking, lotSeed);
    const last = explainStandings(out, [], ranking).rows.map((r, i) => ({ ...r, rank: rows.length + i + 1, withdrawn: true as const }));
    groupStates.push({ group, entries, standings: [...rows, ...last], tieBreaks, complete });
  });
  const knockoutMatches = structure.matches.filter((m) => m.phase === 'knockout').map(resolveMatch);
  const matches = [...groupMatches, ...knockoutMatches];

  return {
    matches,
    groups: groupStates,
    placements: [...bracketPlacements(structure, seatEntry, knockoutMatches), ...groupStagePlacements(structure, groupStates)],
    finished: matches.every((m) => m.status === 'finished'),
  };
}

function bracketPlacements(
  structure: CompetitionStructure,
  seatEntry: (seat: SeatRef) => EntryId | null,
  knockoutMatches: readonly ResolvedMatch[],
): Placement[] {
  const knockout = structure.knockout;
  if (!knockout) return [];
  // Unknown seats get placeholder tokens so the bracket can still be resolved; they are filtered out again.
  const placeholder = (i: number) => `\u0000seat${i}`;
  const seats = knockout.seats.map((seat, i) => (seat === null ? null : (seatEntry(seat) ?? placeholder(i))));
  const bracketId = new Map(structure.matches.flatMap((m) => (m.bracketMatch ? [[m.id, m.bracketMatch.id] as const] : [])));
  const results = new Map<string, Side>(
    knockoutMatches.flatMap((m) => (m.status === 'finished' ? [[bracketId.get(m.id)!, m.result!.winner] as const] : [])),
  );
  return knockoutPlacements(knockout.bracket, resolveKnockout(knockout.bracket, seats, results)).filter(
    (p) => !p.entryId.startsWith('\u0000'),
  );
}

/** Places shared by the entries eliminated in the group stage, per group rank, e.g. all thirds share 9th–12th */
export interface GroupRankPlaces {
  rank: number;
  /** Groups large enough to have this rank */
  groups: number[];
  place: number;
  placeTo: number;
}

/** Entries eliminated in the group stage share places by group rank: all thirds, then all fourths, … */
export function groupStagePlaces(structure: CompetitionStructure): GroupRankPlaces[] {
  if (structure.groupSizes.length === 0) return [];
  const qualifiers = structure.format.knockout?.qualifiersPerGroup ?? 0;
  let place = 1 + (structure.knockout?.seats.filter((s) => s !== null).length ?? 0);
  const result: GroupRankPlaces[] = [];
  for (let rank = qualifiers + 1; rank <= Math.max(...structure.groupSizes); rank++) {
    const groups = structure.groupSizes.flatMap((size, g) => (size >= rank ? [g] : []));
    result.push({ rank, groups, place, placeTo: place + groups.length - 1 });
    place += groups.length;
  }
  return result;
}

function groupStagePlacements(structure: CompetitionStructure, groups: readonly GroupState[]): Placement[] {
  return groupStagePlaces(structure).flatMap(({ rank, groups: tier, place, placeTo }) =>
    tier.flatMap((g) => (groups[g]?.complete ? [{ entryId: groups[g].standings[rank - 1]!.entryId, place, placeTo }] : [])),
  );
}

/** Every match that builds on the result of `matchId`, directly or indirectly (in structure order). */
export function dependentMatches(structure: CompetitionStructure, matchId: string): string[] {
  const dependents = new Set<string>();
  let frontier = new Set([matchId]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const m of structure.matches) {
      if (!dependents.has(m.id) && m.dependsOn.some((d) => frontier.has(d))) {
        dependents.add(m.id);
        next.add(m.id);
      }
    }
    frontier = next;
  }
  return structure.matches.filter((m) => dependents.has(m.id)).map((m) => m.id);
}
