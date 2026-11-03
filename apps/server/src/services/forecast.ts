import { simulatePlan, validateFormat, type CompetitionPlan } from '@draw-and-play/domain';
import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { competitions, eventTables, events } from '../db/schema.js';
import { loadCompetitionState, personsOfEntries, structureFor } from './competitions.js';

/** Safety margin of the forecast, shown as a range */
const BUFFER_PERCENT = 10;
/** Actual durations replace the estimate once this many matches of a competition are played */
const MIN_SAMPLES = 3;
/** Start of a future tournament day when no competition sets one */
const DEFAULT_DAY_START = 10 * 60;

type EventRow = typeof events.$inferSelect;

/** Date (YYYY-MM-DD) and minutes since midnight of `date` in the event's time zone */
export function localTime(date: Date, timeZone: string): { day: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Forecast for one tournament day from the real state: played matches drop out, running ones keep their table
 * until they are expected to finish, the rest is planned from now (or, for a future day, from its first start).
 */
export async function eventForecast(ex: Executor, event: EventRow, requestedDay?: string, now = new Date()) {
  const [tables, comps] = await Promise.all([
    ex.select().from(eventTables).where(eq(eventTables.eventId, event.id)).orderBy(asc(eventTables.sortOrder)),
    ex.select().from(competitions).where(eq(competitions.eventId, event.id)).orderBy(asc(competitions.sortOrder), asc(competitions.createdAt)),
  ]);
  const clock = localTime(now, event.timezone);
  const days = [...new Set(comps.flatMap((c) => (c.day ? [c.day] : [])))].sort();
  const day = requestedDay ?? (days.includes(clock.day) ? clock.day : (days.find((d) => d > clock.day) ?? days.at(-1) ?? null));
  const live = day === null || day === clock.day;
  const selected = comps.filter((c) => day === null || c.day === null || c.day === day);
  const starts = selected.flatMap((c) => (c.earliestStart === null ? [] : [c.earliestStart]));
  const startMin = live ? clock.minutes : starts.length > 0 ? Math.min(...starts) : DEFAULT_DAY_START;
  const firstTable = tables[0]?.id;
  const minutesOf = (date: Date) => {
    const local = localTime(date, event.timezone);
    return local.day === clock.day ? local.minutes : startMin;
  };

  const plans: CompetitionPlan[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const included = new Set(selected.map((c) => c.id));
  for (const competition of selected) {
    const loaded = await loadCompetitionState(ex, competition.id);
    const structure = structureFor(competition);
    const entryCount = structure?.entryCount ?? loaded.entries.filter((e) => e.status !== 'withdrawn').length;
    const formatError = validateFormat(competition.format, entryCount);
    if (formatError || !firstTable) {
      skipped.push({ id: competition.id, reason: formatError ?? 'noTables' });
      continue;
    }

    const rowByKey = new Map(loaded.matchRows.map((m) => [m.matchKey, m]));
    const durations = loaded.matchRows.flatMap((m) =>
      m.status === 'finished' && m.calledAt && m.finishedAt ? [(m.finishedAt.getTime() - m.calledAt.getTime()) / 60_000] : [],
    );
    const matchMinutes =
      durations.length >= MIN_SAMPLES
        ? Math.round(Math.min(120, Math.max(5, durations.reduce((a, b) => a + b, 0) / durations.length)))
        : competition.matchMinutes;

    const fixed = new Map<string, { table: string; start: number; end: number }>();
    const participants = new Map<string, string[]>();
    if (loaded.state) {
      const entryIds = loaded.state.matches.flatMap((m) => m.sides.filter((s): s is string => s !== null));
      const personsOf = await personsOfEntries(ex, [...new Set(entryIds)]);
      for (const m of loaded.state.matches) {
        const row = rowByKey.get(m.id);
        if (m.status === 'finished') {
          const end = Math.min(startMin, row?.finishedAt ? minutesOf(row.finishedAt) : startMin);
          fixed.set(m.id, { table: firstTable, start: end - matchMinutes, end });
        } else if (row?.status === 'called' && row.tableId) {
          const start = row.calledAt ? Math.min(startMin, minutesOf(row.calledAt)) : startMin;
          // A match running longer than expected is assumed to finish shortly.
          fixed.set(m.id, { table: row.tableId, start, end: Math.max(start + matchMinutes, startMin + 5) });
        } else if (m.sides[0] && m.sides[1]) {
          participants.set(m.id, [...(personsOf.get(m.sides[0]) ?? []), ...(personsOf.get(m.sides[1]) ?? [])]);
        }
      }
    }

    plans.push({
      id: competition.id,
      entryCount,
      format: competition.format,
      matchMinutes,
      ...(competition.earliestStart !== null && { earliestStart: competition.earliestStart }),
      ...(competition.startAfterId && included.has(competition.startAfterId) && { startAfter: [competition.startAfterId] }),
      ...(competition.tableIds && { tables: competition.tableIds }),
      live: { fixed, participants },
    });
  }

  const plan = plans.length > 0 ? simulatePlan({ competitions: plans, tables: tables.map((t) => t.id), startMin, buffer: { percent: BUFFER_PERCENT } }) : null;
  const fixedKeys = new Set(plans.flatMap((p) => [...(p.live?.fixed?.keys() ?? [])].map((key) => `${p.id}:${key}`)));
  return {
    day,
    days,
    live,
    now: startMin,
    end: plan?.end ?? null,
    endLate: plan?.endLate ?? null,
    competitions: (plan?.competitions ?? []).map((c) => ({
      id: c.id,
      start: c.start,
      groupStageEnd: c.groupStageEnd ?? null,
      end: c.end,
      endLate: c.endLate,
      matchMinutes: plans.find((p) => p.id === c.id)!.matchMinutes,
    })),
    /** Planned (not yet called) matches; for undrawn competitions keys refer to the expected structure */
    matches: (plan?.matches ?? [])
      .filter((m) => !fixedKeys.has(m.taskId))
      .map((m) => ({ competitionId: m.competitionId, matchKey: m.match.id, tableId: m.table, start: m.start, end: m.end })),
    skipped,
  };
}
