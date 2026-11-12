import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { competitions, eventTables, type EventSettings } from '../db/schema.js';
import { competitionView, loadCompetitionState, personName, type Audience } from './competitions.js';

type CompetitionView = ReturnType<typeof competitionView>;
type MatchView = CompetitionView['matches'][number];

export interface SideView {
  entryId: string;
  /** "Max Muster" or "Max Muster / Erika Beispiel" */
  name: string;
  clubs: string[];
  personIds: string[];
  /**
   * Queue only: when this side last finished a match (ISO time); for a pair the partner who played last.
   * null = no match played yet today. Lets the desk see who has had a rest.
   */
  restingSince?: string | null;
}

export interface OperationsMatch extends Omit<MatchView, 'sides'> {
  competitionId: string;
  sides: [SideView | null, SideView | null];
  /** Queue only: a player of this match is currently playing at another table */
  busy?: boolean;
}

interface FinishedLike {
  status: string;
  finishedAt: Date | string | null;
  sides: readonly (Pick<SideView, 'personIds'> | null)[];
}

/** The end of each person's latest finished match, across all competitions of the event */
export function lastFinishedByPerson(matches: readonly FinishedLike[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const m of matches) {
    if (m.status !== 'finished' || !m.finishedAt) continue;
    const at = new Date(m.finishedAt).getTime();
    for (const personId of m.sides.flatMap((s) => s?.personIds ?? [])) {
      if (at > (last.get(personId) ?? -Infinity)) last.set(personId, at);
    }
  }
  return last;
}

/** When a side became free: the latest end among its players, or null if none of them has played */
export function restingSince(personIds: readonly string[], last: ReadonlyMap<string, number>): string | null {
  const times = personIds.flatMap((p) => (last.has(p) ? [last.get(p)!] : []));
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * Everything the match desk, phones at the tables and the projector need in one response:
 * who plays where, what is ready to be called next, and the latest results.
 */
export async function eventOperations(ex: Executor, eventId: string, settings: EventSettings, audience: Audience) {
  const [tables, comps] = await Promise.all([
    ex.select().from(eventTables).where(eq(eventTables.eventId, eventId)).orderBy(asc(eventTables.sortOrder)),
    ex.select().from(competitions).where(eq(competitions.eventId, eventId)).orderBy(asc(competitions.sortOrder), asc(competitions.createdAt)),
  ]);

  const all: OperationsMatch[] = [];
  for (const competition of comps) {
    const loaded = await loadCompetitionState(ex, competition.id);
    const view = competitionView(loaded, settings, audience);
    const sideOf = new Map(
      loaded.entries.map((e) => [
        e.id,
        {
          entryId: e.id,
          name: e.members.map((m) => personName(m, settings, audience)).join(' / '),
          clubs: [...new Set(e.members.flatMap((m) => (m.club ? [m.club] : [])))],
          personIds: e.members.map((m) => m.id),
        } satisfies SideView,
      ]),
    );
    /** A side: the entry, with rotating partners together with the partner, e.g. "Max Muster / Erika Beispiel" */
    const side = (entryId: string | null, partnerId: string | null | undefined): SideView | null => {
      const own = entryId ? sideOf.get(entryId) : undefined;
      if (!own) return null;
      const partner = partnerId ? sideOf.get(partnerId) : undefined;
      if (!partner) return own;
      return {
        entryId: own.entryId,
        name: `${own.name} / ${partner.name}`,
        clubs: [...new Set([...own.clubs, ...partner.clubs])],
        personIds: [...own.personIds, ...partner.personIds],
      };
    };
    for (const m of view.matches) {
      all.push({
        ...m,
        competitionId: competition.id,
        sides: [side(m.sides[0], m.partners?.[0]), side(m.sides[1], m.partners?.[1])],
      });
    }
  }

  const called = all.filter((m) => m.status === 'called');
  const playing = new Set(called.flatMap((m) => m.sides.flatMap((s) => s?.personIds ?? [])));
  const lastFinished = lastFinishedByPerson(all);
  const queue = all
    .filter((m) => m.status === 'ready')
    .map((m) => ({
      ...m,
      busy: m.sides.some((s) => s?.personIds.some((p) => playing.has(p))),
      sides: m.sides.map((side) => side && { ...side, restingSince: restingSince(side.personIds, lastFinished) }) as OperationsMatch['sides'],
    }));
  const recent = all
    .filter((m) => m.status === 'finished' && m.finishedAt)
    .sort((a, b) => new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime())
    .slice(0, 12);

  return {
    competitions: comps.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind, matchMinutes: c.matchMinutes })),
    tables: tables.map((t) => ({ id: t.id, name: t.name, match: called.find((m) => m.tableId === t.id) ?? null })),
    queue,
    recent,
  };
}
