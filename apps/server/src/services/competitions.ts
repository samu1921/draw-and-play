import {
  buildStructure,
  getSportProfile,
  resolveCompetition,
  type CompetitionState,
  type CompetitionStructure,
  type DrawEntry,
  type SeatRef,
  type MatchResult,
  type SportProfile,
} from '@draw-and-play/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { competitions, entries, entryMembers, events, matches, persons, type EventSettings } from '../db/schema.js';
import { notFound } from '../errors.js';

export type CompetitionRow = typeof competitions.$inferSelect;
export type PersonRow = typeof persons.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;

export interface EntryWithMembers {
  id: string;
  seed: number | null;
  status: 'registered' | 'present' | 'withdrawn';
  members: PersonRow[];
}

export async function loadCompetition(ex: Executor, id: string): Promise<CompetitionRow> {
  const [row] = await ex.select().from(competitions).where(eq(competitions.id, id)).limit(1);
  if (!row) throw notFound('competition');
  return row;
}

export async function loadEntries(ex: Executor, competitionId: string): Promise<EntryWithMembers[]> {
  const rows = await ex
    .select({ entry: entries, member: entryMembers, person: persons })
    .from(entries)
    .leftJoin(entryMembers, eq(entryMembers.entryId, entries.id))
    .leftJoin(persons, eq(persons.id, entryMembers.personId))
    .where(eq(entries.competitionId, competitionId))
    .orderBy(asc(entries.createdAt), asc(entries.id), asc(entryMembers.position));
  const byId = new Map<string, EntryWithMembers>();
  for (const { entry, person } of rows) {
    const e = byId.get(entry.id) ?? { id: entry.id, seed: entry.seed, status: entry.status, members: [] };
    if (person) e.members.push(person);
    byId.set(entry.id, e);
  }
  return [...byId.values()];
}

/** Entries the draw will have: in doubles, players still waiting for a partner count as half a pair each. */
export function expectedEntryCount(competition: CompetitionRow, list: readonly EntryWithMembers[]): number {
  const active = list.filter((e) => e.status !== 'withdrawn');
  if (competition.kind !== 'doubles') return active.length;
  const unpaired = active.filter((e) => e.members.length === 1).length;
  return active.length - unpaired + Math.ceil(unpaired / 2);
}

/** The structure matching a stored draw: the number of drawn entries fixes group sizes and bracket. */
export function structureFor(competition: CompetitionRow): CompetitionStructure | null {
  const draw = competition.draw;
  if (!draw) return null;
  const count = draw.type === 'groups' ? draw.groups.flat().length : draw.seats.filter((s) => s !== null).length;
  return buildStructure(competition.format, count);
}

/** Seeding input: singles use the player's rating, doubles the average; club only if both share it. */
export function toDrawEntry(entry: EntryWithMembers): DrawEntry {
  const ratings = entry.members.flatMap((m) => (m.rating === null ? [] : [m.rating]));
  const clubs = new Set(entry.members.map((m) => m.club));
  const [club] = clubs;
  return {
    id: entry.id,
    seed: entry.seed ?? undefined,
    rating: ratings.length === entry.members.length && ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined,
    club: clubs.size === 1 && club ? club : undefined,
  };
}

/** The sport profile of an event: scoring, result notation and standings order */
export async function sportOfEvent(ex: Executor, eventId: string): Promise<SportProfile> {
  const [event] = await ex.select({ sport: events.sport }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw notFound('event');
  return getSportProfile(event.sport);
}

export interface LoadedCompetition {
  competition: CompetitionRow;
  sport: SportProfile;
  entries: EntryWithMembers[];
  matchRows: MatchRow[];
  structure: CompetitionStructure | null;
  state: CompetitionState | null;
}

export async function loadCompetitionState(ex: Executor, competitionId: string): Promise<LoadedCompetition> {
  const competition = await loadCompetition(ex, competitionId);
  const [entryList, matchRows, sport] = await Promise.all([
    loadEntries(ex, competitionId),
    ex.select().from(matches).where(eq(matches.competitionId, competitionId)),
    sportOfEvent(ex, competition.eventId),
  ]);
  const structure = structureFor(competition);
  let state: CompetitionState | null = null;
  if (structure && competition.draw) {
    const results = new Map<string, MatchResult>(
      matchRows.flatMap((m) => (m.status === 'finished' && m.result ? [[m.matchKey, m.result] as const] : [])),
    );
    // Entries that withdrew after the draw lose their remaining matches by walkover.
    const withdrawn = new Set(entryList.filter((e) => e.status === 'withdrawn').map((e) => e.id));
    state = resolveCompetition(structure, competition.draw, results, sport.ranking, { withdrawn });
  }
  return { competition, sport, entries: entryList, matchRows, structure, state };
}

// --- Views ---

export type Audience = 'admin' | 'public';

/** "Max Muster", or "Max M." in public views with short names; just "Max" without a last name */
export function personName(p: Pick<PersonRow, 'firstName' | 'lastName'>, settings: EventSettings, audience: Audience): string {
  if (!p.lastName) return p.firstName;
  if (audience === 'public' && settings.shortNames) return `${p.firstName} ${p.lastName.charAt(0)}.`;
  return `${p.firstName} ${p.lastName}`;
}

export function personView(p: PersonRow, settings: EventSettings, audience: Audience) {
  const base = { id: p.id, name: personName(p, settings, audience), club: p.club };
  if (audience === 'admin') {
    return {
      ...base,
      // What the public sees, so the admin can spot players who would look the same
      publicName: personName(p, settings, 'public'),
      firstName: p.firstName,
      lastName: p.lastName,
      gender: p.gender,
      birthYear: p.birthYear,
      licenceNo: p.licenceNo,
      rating: p.rating,
    };
  }
  return settings.publicRatings ? { ...base, rating: p.rating } : base;
}

export async function eventSettings(ex: Executor, eventId: string): Promise<EventSettings> {
  const [row] = await ex.select({ settings: events.settings }).from(events).where(eq(events.id, eventId)).limit(1);
  return row?.settings ?? {};
}

export function competitionSummary(c: CompetitionRow) {
  return {
    id: c.id,
    eventId: c.eventId,
    name: c.name,
    kind: c.kind,
    day: c.day,
    color: c.color,
    sortOrder: c.sortOrder,
    matchRules: c.matchRules,
    matchMinutes: c.matchMinutes,
    format: c.format,
    earliestStart: c.earliestStart,
    startAfterId: c.startAfterId,
    tableIds: c.tableIds,
    drawn: c.draw !== null,
    version: c.version,
  };
}

/** Everything a client needs to show a competition: entries, groups, matches with live status, places. */
export function competitionView(loaded: LoadedCompetition, settings: EventSettings, audience: Audience) {
  const { competition, state, structure, matchRows } = loaded;
  const rowByKey = new Map(matchRows.map((m) => [m.matchKey, m]));
  const structureOf = new Map(structure?.matches.map((m) => [m.id, m]) ?? []);
  /** Where a side comes from, so clients can show "1st group A" or "winner semifinal 1" while it is open */
  const sourceOf = (seat: SeatRef) => {
    switch (seat.type) {
      case 'qualifier':
        return { type: 'qualifier' as const, group: seat.group, rank: seat.rank };
      case 'winner':
      case 'loser':
        return { type: seat.type, matchKey: seat.match };
      default:
        return { type: 'draw' as const };
    }
  };
  return {
    competition: competitionSummary(competition),
    ...(audience === 'admin' && { drawSeed: competition.drawSeed }),
    entries: loaded.entries.map((e) => ({
      id: e.id,
      ...(audience === 'admin' && { seed: e.seed }),
      status: e.status,
      members: e.members.map((m) => personView(m, settings, audience)),
    })),
    groups:
      state?.groups.map((g) => ({ group: g.group, entries: g.entries, standings: g.standings, tieBreaks: g.tieBreaks, complete: g.complete })) ??
      [],
    matches:
      state?.matches.map((m) => {
        const row = rowByKey.get(m.id);
        const structureMatch = structureOf.get(m.id);
        const places = structureMatch?.bracketMatch?.places;
        return {
          id: row?.id ?? null,
          key: m.id,
          phase: m.phase,
          group: m.group ?? null,
          round: m.round,
          places: places ?? null,
          sides: m.sides,
          sources: structureMatch ? [sourceOf(structureMatch.sides[0]), sourceOf(structureMatch.sides[1])] : null,
          status: m.status === 'finished' ? 'finished' : row?.status === 'called' ? 'called' : m.status,
          tableId: row?.status === 'called' ? row.tableId : null,
          calledAt: row?.calledAt ?? null,
          finishedAt: row?.finishedAt ?? null,
          result: m.result ?? null,
          version: row?.version ?? 0,
        };
      }) ?? [],
    placements: state?.placements ?? [],
    finished: state?.finished ?? false,
  };
}

/** Person ids per entry, for "player is busy" checks across competitions */
export async function personsOfEntries(ex: Executor, entryIds: string[]): Promise<Map<string, string[]>> {
  if (entryIds.length === 0) return new Map();
  const rows = await ex.select().from(entryMembers).where(inArray(entryMembers.entryId, entryIds));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.entryId, [...(map.get(r.entryId) ?? []), r.personId]);
  return map;
}
