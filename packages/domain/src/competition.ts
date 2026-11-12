import { drawKnockout } from './bracket.js';
import { bestNextCount, swissMatchId, type BracketStage, type CompetitionStructure, type SeatRef, type StructureMatch } from './format.js';
import { drawGroups, rankForSeeding, type DrawEntry, type SeedPlacement } from './groupDraw.js';
import { knockoutPlacements, resolveKnockout, type Placement } from './knockout.js';
import { createRng, shuffle, type Rng, type Seed } from './rng.js';
import type { Ranking, Side } from './sport/types.js';
import { explainStandings, tallyStandings, type EntryId, type MatchResult, type RankingInput, type StandingsMatch, type StandingsRow, type TieBreak } from './standings.js';
import { pairSwissRound, swissStandings, type SwissRound, type SwissRoundResults } from './swiss.js';
import { assignBestNext, rankAcrossGroups, type CrossGroupRow } from './transition.js';

/**
 * Result of the draw: entries per group position, or per knockout position (`null` = bye). In a Swiss system the
 * draw holds the starting order (seeds first) and the pairings of every round paired so far; `syncSwissRounds`
 * adds the next round once the one before is finished.
 */
export type Draw =
  | { type: 'groups'; groups: EntryId[][] }
  | { type: 'knockout'; seats: (EntryId | null)[] }
  | { type: 'swiss'; order: EntryId[]; rounds: SwissRound[] };

export type DrawError =
  | 'wrongEntryCount'
  | 'wrongDrawType'
  | 'wrongGroupSizes'
  | 'wrongSeatCount'
  | 'byeMismatch'
  | 'duplicateEntry'
  | 'wrongRounds';

/** The entries of a draw, each once */
export function drawnEntries(draw: Draw): EntryId[] {
  switch (draw.type) {
    case 'groups':
      return draw.groups.flat();
    case 'knockout':
      return draw.seats.filter((s): s is EntryId => s !== null);
    case 'swiss':
      return draw.order;
  }
}

/** Order of a Swiss table when the sport does not set one: wins, Buchholz score, head-to-head, lots */
export const DEFAULT_SWISS_RANKING: Ranking = {
  criteria: ['matchPoints', 'buchholz', 'headToHead'],
  headToHead: ['matchPoints'],
  lastResort: 'lot',
};

export function validateDraw(structure: CompetitionStructure, draw: Draw): DrawError | null {
  if (structure.swiss) {
    if (draw.type !== 'swiss') return 'wrongDrawType';
    if (draw.order.length !== structure.entryCount) return 'wrongEntryCount';
    if (new Set(draw.order).size !== draw.order.length) return 'duplicateEntry';
    const known = new Set(draw.order);
    if (draw.rounds.length > structure.swiss.rounds) return 'wrongRounds';
    for (const round of draw.rounds) {
      const ids = [...round.pairs.flat(), ...(round.bye === undefined ? [] : [round.bye])];
      if (round.pairs.length > structure.swiss.boards || ids.some((id) => !known.has(id)) || new Set(ids).size !== ids.length) return 'wrongRounds';
    }
    return null;
  }
  if (draw.type === 'swiss') return 'wrongDrawType';
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
  /**
   * Number of seeded entries: default the group heads, or a quarter of the bracket (at least 2) in a knockout.
   * Swiss system: the seeds lead the starting order and the others are drawn below them; default the upper half,
   * so that in round 1 every seed meets a drawn opponent from the lower half.
   */
  seedCount?: number;
  /**
   * Groups (default fixed): see `drawGroups`.
   * Knockout (default drawn): seeds 1 and 2 are always fixed; drawn lets seeds 3/4, 5–8, … be drawn among their tier.
   */
  seedPlacement?: SeedPlacement;
}

/**
 * Draws the entries into the structure: groups by seeding list with club separation, a seeded knockout, or the
 * starting order and first round of a Swiss system.
 */
export function drawForStructure(
  structure: CompetitionStructure,
  entries: readonly DrawEntry[],
  rng: Rng,
  options: CompetitionDrawOptions = {},
): Draw {
  if (entries.length !== structure.entryCount) {
    throw new Error(`Draw needs ${structure.entryCount} entries, got ${entries.length}`);
  }
  if (structure.swiss) {
    const ranked = rankForSeeding(entries).map((e) => e.id);
    const seedCount = Math.max(0, Math.min(options.seedCount ?? Math.ceil(ranked.length / 2), ranked.length));
    const order = [...ranked.slice(0, seedCount), ...shuffle(ranked.slice(seedCount), rng)];
    return { type: 'swiss', order, rounds: [pairSwissRound({ ranked: order, wins: new Map(), previous: [] })] };
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

/** A consolation field of three that plays everybody against everybody */
export interface PlacementGroupState {
  /** Id of the field, see `PlacementGroup` */
  stage: string;
  /** The places the field plays for */
  places: [number, number];
  /** Empty until the group stage has decided who plays here */
  entries: EntryId[];
  standings: StandingsRow[];
  tieBreaks: TieBreak[];
  complete: boolean;
}

/**
 * One group rank compared across all groups: when the best of it fill the knockout bracket, or to seed a
 * consolation bracket so that its byes go to the best.
 */
export interface NextRankedState {
  /** The group rank, e.g. 3 for the third-placed entries */
  rank: number;
  /** How many of them advance to the main bracket; 0 when the comparison only seeds a consolation bracket */
  advancing: number;
  /**
   * Best first; provisional until `complete`. With groups of different sizes the rows only count the matches
   * against the first `comparedSize` of the own group, so every entry is compared on the same opponents.
   */
  rows: CrossGroupRow[];
  /** Set when the groups differ in size: matches against entries ranked below this in their group do not count */
  comparedSize?: number;
  /** All groups are finished, so the order is final */
  complete: boolean;
}

export interface CompetitionState {
  /** Swiss system: without the boards of a paired round that stay empty after withdrawals */
  matches: ResolvedMatch[];
  /** A Swiss system has one table with all entries (group 0) */
  groups: GroupState[];
  nextRanked?: NextRankedState;
  /** Further group ranks compared across the groups, to seed the consolation brackets */
  seeding: NextRankedState[];
  /** Consolation fields of three with their tables */
  placementGroups: PlacementGroupState[];
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
  /** Order of the table in a Swiss system (default `DEFAULT_SWISS_RANKING`) */
  swissRanking?: RankingInput;
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
  /** Per group the finished matches that count for its table */
  const groupResults: StandingsMatch[][] = [];
  /** Entry per `bestNext` seat, once all groups are finished */
  const bestNext = new Map<string, EntryId>();
  const bestNextKey = (rank: number, index: number) => `${rank}:${index}`;

  const seatEntry = (seat: SeatRef): EntryId | null => {
    switch (seat.type) {
      case 'groupSeat':
        return draw.type === 'groups' ? (draw.groups[seat.group]?.[seat.position] ?? null) : null;
      case 'drawSeat':
        return draw.type === 'knockout' ? (draw.seats[seat.position] ?? null) : null;
      case 'swissSeat':
        return draw.type === 'swiss' ? (draw.rounds[seat.round - 1]?.pairs[seat.board]?.[seat.side] ?? null) : null;
      case 'qualifier': {
        const group = groupStates[seat.group];
        return group?.complete ? (group.standings[seat.rank - 1]?.entryId ?? null) : null;
      }
      case 'bestNext':
        return bestNext.get(bestNextKey(seat.rank, seat.index)) ?? null;
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
  /** The table of entries that play everybody against everybody */
  const tableOf = (entries: readonly EntryId[], own: readonly ResolvedMatch[], lot: string | number) => {
    // Matches of withdrawn entries are annulled for the table; the withdrawn are ranked last, in draw order.
    const finished: StandingsMatch[] = own
      .filter((m) => m.status === 'finished' && !withdrawn.has(m.sides[0]!) && !withdrawn.has(m.sides[1]!))
      .map((m) => ({ a: m.sides[0]!, b: m.sides[1]!, result: m.result! }));
    const active = entries.filter((id) => !withdrawn.has(id));
    const out = entries.filter((id) => withdrawn.has(id));
    const complete = own.every((m) => m.status === 'finished');
    // Lots decide the final order only: while the group runs, the draw order stands in provisionally.
    const lotSeed = options.lotSeed !== undefined && complete ? { lotSeed: `${options.lotSeed}:${lot}` } : {};
    const { rows, tieBreaks } = explainStandings(active, finished, ranking, lotSeed);
    const last = explainStandings(out, [], ranking).rows.map((r, i) => ({ ...r, rank: rows.length + i + 1, withdrawn: true as const }));
    return { standings: [...rows, ...last], tieBreaks, complete, finished };
  };
  (structure.swiss ? [] : structure.groupSizes).forEach((_, group) => {
    const entries = draw.type === 'groups' ? (draw.groups[group] ?? []) : [];
    const { finished, ...table } = tableOf(entries, groupMatches.filter((m) => m.group === group), group);
    groupStates.push({ group, entries, ...table });
    groupResults.push(finished);
  });
  // Swiss system: round by round, so that a walkover in one round already counts in the next.
  const swissMatches: ResolvedMatch[] = [];
  if (structure.swiss && draw.type === 'swiss') {
    for (const m of structure.matches) {
      const seat = m.sides[0];
      if (seat.type !== 'swissSeat') continue;
      // A paired round only uses as many boards as it has pairs.
      const round = draw.rounds[m.round - 1];
      if (round && seat.board >= round.pairs.length) continue;
      swissMatches.push(resolveMatch(m));
    }
    // Unplayed with both sides withdrawn: nobody is credited a win.
    const isVoid = (m: ResolvedMatch) => m.withdrawal === true && withdrawn.has(m.winner!);
    const rounds = draw.rounds.map((round, r): SwissRoundResults => {
      const finished = swissMatches.filter((m) => m.round === r + 1 && m.status === 'finished');
      const paired = new Set([...round.pairs.flat(), ...(round.bye === undefined ? [] : [round.bye])]);
      return {
        matches: finished.filter((m) => !isVoid(m)).map((m) => ({ a: m.sides[0]!, b: m.sides[1]!, result: m.result! })),
        void: finished.filter(isVoid).map((m) => [m.sides[0]!, m.sides[1]!] as const),
        bye: round.bye,
        absent: draw.order.filter((id) => !paired.has(id)),
      };
    });
    const complete = draw.rounds.length === structure.swiss.rounds && swissMatches.every((m) => m.status === 'finished');
    const lotSeed = options.lotSeed !== undefined && complete ? { lotSeed: `${options.lotSeed}:swiss` } : {};
    const { rows, tieBreaks } = swissStandings(draw.order, rounds, options.swissRanking ?? DEFAULT_SWISS_RANKING, lotSeed);
    // Unlike in a group, a withdrawn entry keeps its wins and its place in the table (DTTB WO D 7.6).
    const standings = rows.map((row) => (withdrawn.has(row.entryId) ? { ...row, withdrawn: true as const } : row));
    groupStates.push({ group: 0, entries: draw.order, standings, tieBreaks, complete });
  }

  // Group ranks compared across the groups: the rank below the qualifiers when its best fill the main bracket,
  // and every rank a consolation field is seeded by.
  const comparisons = compareRanks(structure, groupStates, groupResults, options.lotSeed);
  for (const { rank, rows, complete } of comparisons) {
    if (complete) rows.forEach(({ row }, i) => bestNext.set(bestNextKey(rank, i), row.entryId));
  }
  const nextRanked = comparisons.find((c) => c.advancing > 0);
  if (nextRanked?.complete && structure.knockout) {
    // Those that advance are seated away from their own group; the others keep the order of the comparison.
    const positions: number[] = [];
    const seated = new Map<number, number[]>();
    structure.knockout.seats.forEach((seat, position) => {
      if (seat?.type === 'bestNext') positions[seat.index] = position;
      if (seat?.type === 'qualifier') seated.set(seat.group, [...(seated.get(seat.group) ?? []), position]);
    });
    const advancing = nextRanked.rows.slice(0, nextRanked.advancing);
    const slots = assignBestNext(advancing.map((r) => r.group), positions, seated);
    advancing.forEach(({ row }, i) => bestNext.set(bestNextKey(nextRanked.rank, slots[i] ?? i), row.entryId));
  }
  for (const stage of structure.consolation?.brackets ?? []) {
    if (!stage.seeded) continue;
    for (const [key, entryId] of seatSeeded(stage, comparisons)) bestNext.set(key, entryId);
  }

  // Not turning up to a match of a consolation field counts as withdrawing from it, as in a group.
  for (const m of structure.matches) {
    const recorded = results.get(m.id);
    if (m.phase !== 'placement' || !recorded?.walkover) continue;
    const loser = seatEntry(m.sides[(1 - recorded.winner) as Side]!);
    if (loser !== null) withdrawn.add(loser);
  }
  const laterMatches = structure.matches.filter((m) => m.phase === 'knockout' || m.phase === 'placement').map(resolveMatch);
  const knockoutMatches = laterMatches.filter((m) => m.phase === 'knockout');
  const stageOf = new Map(structure.matches.map((m) => [m.id, m.stage]));
  const placementGroups = (structure.consolation?.groups ?? []).map((field): PlacementGroupState => {
    const seats = field.seats.map(seatEntry);
    const entries = seats.every((id): id is EntryId => id !== null) ? seats : [];
    const own = laterMatches.filter((m) => stageOf.get(m.id) === field.id);
    const { finished: _, ...table } = tableOf(entries, own, field.id);
    return {
      stage: field.id,
      places: [field.placeOffset + 1, field.placeOffset + field.seats.length],
      entries,
      ...table,
      complete: entries.length > 0 && table.complete,
    };
  });
  const matches = [...groupMatches, ...swissMatches, ...laterMatches];
  const stages = [...(structure.knockout ? [structure.knockout] : []), ...(structure.consolation?.brackets ?? [])];
  const direct = (structure.consolation?.direct ?? []).flatMap(({ seat, place }): Placement[] => {
    const entryId = seatEntry(seat);
    return entryId === null ? [] : [{ entryId, place, placeTo: place }];
  });
  const played = placementGroups.flatMap((field) =>
    field.complete ? field.standings.map((row, i): Placement => ({ entryId: row.entryId, place: field.places[0] + i, placeTo: field.places[0] + i })) : [],
  );

  return {
    matches,
    groups: groupStates,
    ...(nextRanked && { nextRanked }),
    seeding: comparisons.filter((c) => c !== nextRanked),
    placementGroups,
    placements: [
      ...stages.flatMap((stage) => bracketPlacements(structure, stage, seatEntry, knockoutMatches)),
      ...played,
      ...direct,
      ...groupStagePlacements(structure, groupStates, nextRanked),
    ].sort((a, b) => a.place - b.place),
    finished: matches.every((m) => m.status === 'finished'),
  };
}

/**
 * The group ranks that are compared across the groups: the rank below the qualifiers if its best entries fill the
 * main bracket, and every rank a seat of the consolation refers to.
 * With groups of different sizes an entry of a larger group has played more matches, the additional ones against
 * the bottom of its group. These do not count: every entry is compared on its matches against the first
 * `comparedSize` of its group, the size of the smallest group.
 */
function compareRanks(
  structure: CompetitionStructure,
  groups: readonly GroupState[],
  results: readonly (readonly StandingsMatch[])[],
  lotSeed: Seed | undefined,
): NextRankedState[] {
  if (!structure.format.groups) return [];
  const consolation = structure.consolation;
  const seats = [
    ...(structure.knockout?.seats ?? []),
    ...(consolation?.brackets ?? []).flatMap((b) => b.seats),
    ...(consolation?.groups ?? []).flatMap((g) => g.seats),
    ...(consolation?.direct ?? []).map((d) => d.seat),
  ];
  const ranks = [...new Set(seats.flatMap((seat) => (seat?.type === 'bestNext' ? [seat.rank] : [])))].sort((a, b) => a - b);
  const next = (structure.format.knockout?.qualifiersPerGroup ?? 0) + 1;
  const complete = groups.length > 0 && groups.every((g) => g.complete);
  return ranks.map((rank) => {
    // Lots decide the final order only, as in the group tables.
    const lots = complete && lotSeed !== undefined ? shuffle(groups.map((g) => g.group), createRng(`${lotSeed}:next:${rank}`)) : null;
    const smallest = Math.max(rank, Math.min(...groups.map((g) => g.entries.length)));
    const uneven = groups.some((g) => g.entries.length > smallest);
    const rows = groups.flatMap((g): CrossGroupRow[] => {
      const row = g.standings[rank - 1];
      if (!row) return [];
      const below = new Set(g.standings.slice(smallest).map((r) => r.entryId));
      if (below.size === 0 || row.withdrawn) return [{ group: g.group, row }];
      const counted = (results[g.group] ?? []).filter((m) => !below.has(m.a) && !below.has(m.b));
      const stats = tallyStandings(g.entries, counted).get(row.entryId)!;
      return [{ group: g.group, row: { ...stats, rank: row.rank } }];
    });
    return {
      rank,
      advancing: rank === next ? bestNextCount(structure.format) : 0,
      rows: rankAcrossGroups(rows, lots ? (group) => lots.indexOf(group) : undefined),
      ...(uneven && { comparedSize: smallest }),
      complete,
    };
  });
}

/**
 * Fills a consolation bracket that is seeded by comparison, rank by rank: the byes go to the best of a rank, the
 * others are seated so that they meet entries of their own group as late as possible.
 * Result: entry per `bestNext` seat (`<rank>:<index>`); empty until every group is finished.
 */
function seatSeeded(stage: BracketStage, comparisons: readonly NextRankedState[]): Map<string, EntryId> {
  const result = new Map<string, EntryId>();
  const opponent = new Map<number, number>();
  for (const m of stage.bracket.matches) {
    const [a, b] = m.sides;
    if (m.round !== 1 || a.type !== 'seat' || b.type !== 'seat') continue;
    opponent.set(a.index, b.index);
    opponent.set(b.index, a.index);
  }
  const hasBye = (position: number) => stage.seats[opponent.get(position) ?? -1] === null;
  const seated = new Map<number, number[]>();
  for (const comparison of comparisons) {
    const tier = stage.seats
      .flatMap((seat, position) => (seat?.type === 'bestNext' && seat.rank === comparison.rank ? [{ index: seat.index, position }] : []))
      .sort((a, b) => a.index - b.index);
    if (tier.length === 0) continue;
    if (!comparison.complete) return new Map();
    const entries = tier.flatMap(({ index }) => comparison.rows[index] ?? []);
    const free = tier.filter((seat) => hasBye(seat.position));
    const open = tier.filter((seat) => !hasBye(seat.position));
    const rest = entries.slice(free.length);
    const slots = assignBestNext(rest.map((r) => r.group), open.map((seat) => seat.position), seated);
    const taken = [...free, ...rest.map((_, i) => open[slots[i] ?? i]!)];
    entries.forEach(({ group, row }, i) => {
      const seat = taken[i];
      if (!seat) return;
      result.set(`${comparison.rank}:${seat.index}`, row.entryId);
      seated.set(group, [...(seated.get(group) ?? []), seat.position]);
    });
  }
  return result;
}

function bracketPlacements(
  structure: CompetitionStructure,
  stage: BracketStage,
  seatEntry: (seat: SeatRef) => EntryId | null,
  knockoutMatches: readonly ResolvedMatch[],
): Placement[] {
  // Unknown seats get placeholder tokens so the bracket can still be resolved; they are filtered out again.
  const placeholder = (i: number) => `\u0000seat${i}`;
  const seats = stage.seats.map((seat, i) => (seat === null ? null : (seatEntry(seat) ?? placeholder(i))));
  const bracketId = new Map(structure.matches.flatMap((m) => (m.bracketMatch && m.stage === stage.id ? [[m.id, m.bracketMatch.id] as const] : [])));
  const results = new Map<string, Side>(
    knockoutMatches.flatMap((m) => (m.status === 'finished' && bracketId.has(m.id) ? [[bracketId.get(m.id)!, m.result!.winner] as const] : [])),
  );
  return knockoutPlacements(stage.bracket, resolveKnockout(stage.bracket, seats, results)).filter((p) => !p.entryId.startsWith('\u0000'));
}

/** Places shared by the entries eliminated in the group stage, per group rank, e.g. all thirds share 9th–12th */
export interface GroupRankPlaces {
  rank: number;
  /** Groups large enough to have this rank */
  groups: number[];
  /** How many of this rank advance to the knockout as the best of it; they are not part of the shared places */
  advancing: number;
  place: number;
  placeTo: number;
}

/**
 * Entries eliminated in the group stage share places by group rank: all thirds, then all fourths, …
 * Empty when they play on in consolation brackets. A Swiss table or a single group gives every rank its own place.
 */
export function groupStagePlaces(structure: CompetitionStructure): GroupRankPlaces[] {
  if (structure.groupSizes.length === 0 || structure.consolation) return [];
  const qualifiers = structure.format.knockout?.qualifiersPerGroup ?? 0;
  const bestNext = bestNextCount(structure.format);
  let place = 1 + (structure.knockout?.seats.filter((s) => s !== null).length ?? 0);
  const result: GroupRankPlaces[] = [];
  for (let rank = qualifiers + 1; rank <= Math.max(...structure.groupSizes); rank++) {
    const groups = structure.groupSizes.flatMap((size, g) => (size >= rank ? [g] : []));
    const advancing = rank === qualifiers + 1 ? bestNext : 0;
    const count = groups.length - advancing;
    if (count <= 0) continue;
    result.push({ rank, groups, advancing, place, placeTo: place + count - 1 });
    place += count;
  }
  return result;
}

function groupStagePlacements(structure: CompetitionStructure, groups: readonly GroupState[], nextRanked: NextRankedState | undefined): Placement[] {
  return groupStagePlaces(structure).flatMap(({ rank, groups: tier, advancing, place, placeTo }) => {
    if (advancing > 0) {
      // Who of this rank is out is only known once the comparison across the groups is final.
      return nextRanked?.complete ? nextRanked.rows.slice(advancing).map(({ row }) => ({ entryId: row.entryId, place, placeTo })) : [];
    }
    return tier.flatMap((g) => (groups[g]?.complete ? [{ entryId: groups[g].standings[rank - 1]!.entryId, place, placeTo }] : []));
  });
}

export interface SwissSyncOptions extends ResolveOptions {
  /** Matches on a table or with a result (structure match ids): their round keeps its pairings */
  started?: ReadonlySet<string>;
}

/**
 * Brings the paired rounds of a Swiss draw up to date: the next round is paired as soon as the one before is
 * finished. A round nobody has started yet is paired again, so a correction or a withdrawal before it begins
 * still counts; once a match of the round is called or played, its pairings stay.
 * Returns the draw itself when nothing changes.
 */
export function syncSwissRounds(
  structure: CompetitionStructure,
  draw: Draw,
  results: ReadonlyMap<string, MatchResult>,
  ranking: RankingInput,
  options: SwissSyncOptions = {},
): Draw {
  if (!structure.swiss || draw.type !== 'swiss') return draw;
  const { rounds: total, boards } = structure.swiss;
  const isStarted = (round: number) =>
    Array.from({ length: boards }, (_, board) => swissMatchId(round, board)).some((id) => results.has(id) || options.started?.has(id));

  const rounds: SwissRound[] = [];
  for (let round = 1; round <= total; round++) {
    const state = resolveCompetition(structure, { ...draw, rounds: [...rounds] }, results, ranking, options);
    const swiss = state.matches.filter((m) => m.phase === 'swiss');
    if (round > 1 && swiss.some((m) => m.round === round - 1 && m.status !== 'finished')) break;
    const stored = draw.rounds[round - 1];
    if (stored && isStarted(round)) {
      rounds.push(stored);
      continue;
    }
    // Wins without playing so far, so that byes do not go to the same entry again
    const freeWins = new Map<EntryId, number>();
    const credit = (id: EntryId) => freeWins.set(id, (freeWins.get(id) ?? 0) + 1);
    for (const r of rounds) if (r.bye !== undefined) credit(r.bye);
    for (const m of swiss) if (m.status === 'finished' && m.result!.walkover) credit(m.winner!);
    // The table is ordered by wins first; within the same wins it gives the order for pairing.
    const table = state.groups[0]!.standings.filter((row) => !row.withdrawn);
    const ranked = table.map((row, index) => ({ row, index })).sort((a, b) => b.row.won - a.row.won || a.index - b.index);
    rounds.push(
      pairSwissRound({
        ranked: ranked.map(({ row }) => row.entryId),
        wins: new Map(table.map((row) => [row.entryId, row.won])),
        previous: rounds,
        freeWins,
      }),
    );
  }
  return JSON.stringify(rounds) === JSON.stringify(draw.rounds) ? draw : { ...draw, rounds };
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
