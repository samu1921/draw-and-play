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
}

export interface OperationsMatch extends Omit<MatchView, 'sides'> {
  competitionId: string;
  sides: [SideView | null, SideView | null];
  /** Queue only: a player of this match is currently playing at another table */
  busy?: boolean;
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
    for (const m of view.matches) {
      all.push({
        ...m,
        competitionId: competition.id,
        sides: [m.sides[0] ? (sideOf.get(m.sides[0]) ?? null) : null, m.sides[1] ? (sideOf.get(m.sides[1]) ?? null) : null],
      });
    }
  }

  const called = all.filter((m) => m.status === 'called');
  const playing = new Set(called.flatMap((m) => m.sides.flatMap((s) => s?.personIds ?? [])));
  const queue = all
    .filter((m) => m.status === 'ready')
    .map((m) => ({ ...m, busy: m.sides.some((s) => s?.personIds.some((p) => playing.has(p))) }));
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
