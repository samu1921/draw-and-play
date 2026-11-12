import type { Side } from './sport/types.js';
import type { EntryId } from './standings.js';

/** Where a knockout slot is filled from */
export type SlotSource =
  | { type: 'seat'; index: number }
  | { type: 'winner'; match: string }
  | { type: 'loser'; match: string };

export interface KnockoutMatch {
  id: string;
  /** Running match number, ordered by round and place range */
  number: number;
  /** Round counted from the start of the main bracket (1 = first round) */
  round: number;
  /** Place range played for in this round, e.g. [1, 8] in the quarterfinal, [3, 4] in the match for 3rd place */
  places: [number, number];
  sides: [SlotSource, SlotSource];
}

export interface Knockout {
  size: number;
  playOutPlaces: number;
  /** Places taken before this bracket: 0 for the main bracket, 8 for a consolation bracket playing from place 9 */
  placeOffset: number;
  matches: KnockoutMatch[];
}

export interface KnockoutOptions {
  /**
   * Places played out: 2 = final only, 4 = with match for 3rd place, 8 = places 1–8, bracket size = all places.
   */
  playOutPlaces: number;
  /** The bracket plays for the places after this one (default 0); `playOutPlaces` counts within the bracket */
  placeOffset?: number;
}

/** Knockout bracket of `size` (power of two). Losers continue in sub-brackets for the lower places. */
export function buildKnockout(size: number, options: KnockoutOptions): Knockout {
  const built: Omit<KnockoutMatch, 'number'>[] = [];
  const placeOffset = options.placeOffset ?? 0;

  const build = (sources: SlotSource[], from: number, round: number) => {
    if (sources.length < 2) return;
    const to = from + sources.length - 1;
    const winners: SlotSource[] = [];
    const losers: SlotSource[] = [];
    for (let i = 0; i < sources.length; i += 2) {
      const id = `r${round}p${from}m${i / 2 + 1}`;
      built.push({ id, round, places: [from, to], sides: [sources[i]!, sources[i + 1]!] });
      winners.push({ type: 'winner', match: id });
      losers.push({ type: 'loser', match: id });
    }
    build(winners, from, round + 1);
    const loserFrom = from + sources.length / 2;
    if (loserFrom - placeOffset <= options.playOutPlaces) build(losers, loserFrom, round + 1);
  };

  build(
    Array.from({ length: size }, (_, index): SlotSource => ({ type: 'seat', index })),
    placeOffset + 1,
    1,
  );

  const matches = built
    .map((m, index) => ({ m, index }))
    .sort((a, b) => a.m.round - b.m.round || a.m.places[0] - b.m.places[0] || a.index - b.index)
    .map(({ m }, i) => ({ ...m, number: i + 1 }));
  return { size, playOutPlaces: options.playOutPlaces, placeOffset, matches };
}

/** Language-neutral round name; the UI turns it into "Final", "Halbfinale", "Match for 3rd place" … */
export type KnockoutRoundName =
  /** Main bracket: size 2 = final, 4 = semifinal, 8 = quarterfinal, … */
  | { type: 'main'; size: number }
  /** Single match deciding `place` and `place + 1` */
  | { type: 'placementMatch'; place: number }
  /** Placement bracket round for places `from`–`to` */
  | { type: 'placementRound'; from: number; to: number };

export function knockoutRoundName(match: Pick<KnockoutMatch, 'places'>): KnockoutRoundName {
  const [from, to] = match.places;
  const size = Math.max(2, to - from + 1);
  if (from === 1) return { type: 'main', size };
  return size === 2 ? { type: 'placementMatch', place: from } : { type: 'placementRound', from, to };
}

export const BYE = 'bye';
export type Bye = typeof BYE;
/** Occupant of a side: entry, bye, or `null` = not yet known */
export type Occupant = EntryId | Bye | null;

export interface ResolvedKnockoutMatch {
  /** pending = waiting for predecessors, ready = playable, bye = decided by a bye, finished = played */
  status: 'pending' | 'ready' | 'bye' | 'finished';
  sides: [Occupant, Occupant];
  winner?: EntryId | Bye;
  loser?: EntryId | Bye;
}

/**
 * Resolves the bracket from the draw (`seats`, `null` = bye) and results (winning side per match id).
 * Byes are decided automatically and passed on.
 */
export function resolveKnockout(
  ko: Knockout,
  seats: readonly (EntryId | null)[],
  results: ReadonlyMap<string, Side>,
): Map<string, ResolvedKnockoutMatch> {
  const resolved = new Map<string, ResolvedKnockoutMatch>();
  const occupant = (source: SlotSource): Occupant => {
    if (source.type === 'seat') return seats[source.index] ?? BYE;
    const prior = resolved.get(source.match);
    return (source.type === 'winner' ? prior?.winner : prior?.loser) ?? null;
  };

  for (const match of ko.matches) {
    const sides: [Occupant, Occupant] = [occupant(match.sides[0]), occupant(match.sides[1])];
    const [a, b] = sides;
    if (a === null || b === null) {
      // Against a bye the loser is already known, even while the other side is still open.
      resolved.set(match.id, a === BYE || b === BYE ? { status: 'pending', sides, loser: BYE } : { status: 'pending', sides });
    } else if (a === BYE || b === BYE) {
      const winner = a === BYE ? b : a;
      resolved.set(match.id, { status: 'bye', sides, winner, loser: BYE });
    } else {
      const winnerSide = results.get(match.id);
      resolved.set(
        match.id,
        winnerSide === undefined
          ? { status: 'ready', sides }
          : { status: 'finished', sides, winner: sides[winnerSide]!, loser: sides[1 - winnerSide]! },
      );
    }
  }
  return resolved;
}

export interface Placement {
  entryId: EntryId;
  /** Place reached; for shared places the best one, e.g. 5 for "5th–8th" */
  place: number;
  /** Last place of the shared range (equals `place` when played out) */
  placeTo: number;
}

/** Final placements known so far. Entries still playing are missing. */
export function knockoutPlacements(ko: Knockout, resolved: ReadonlyMap<string, ResolvedKnockoutMatch>): Placement[] {
  const feeds = new Set(ko.matches.flatMap((m) => m.sides.flatMap((s) => (s.type === 'seat' ? [] : [`${s.type}:${s.match}`]))));
  const found: { entryId: EntryId; place: number; last: number }[] = [];

  for (const match of ko.matches) {
    const r = resolved.get(match.id);
    if (!r || (r.status !== 'finished' && r.status !== 'bye')) continue;
    const [from, to] = match.places;
    const half = (to - from + 1) / 2;
    if (!feeds.has(`winner:${match.id}`) && r.winner && r.winner !== BYE) {
      found.push({ entryId: r.winner, place: from, last: from + half - 1 });
    }
    if (!feeds.has(`loser:${match.id}`) && r.loser && r.loser !== BYE) {
      found.push({ entryId: r.loser, place: from + half, last: to });
    }
  }

  const sharing = new Map<number, number>();
  for (const p of found) sharing.set(p.place, (sharing.get(p.place) ?? 0) + 1);
  return found
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p.place - b.p.place || a.index - b.index)
    .map(({ p }) => ({ entryId: p.entryId, place: p.place, placeTo: p.place + sharing.get(p.place)! - 1 }));
}
