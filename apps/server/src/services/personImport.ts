import { and, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { competitions, entries, entryMembers, persons } from '../db/schema.js';
import { badRequest } from '../errors.js';

/** One row of a player import, already mapped and checked by the client */
export interface ImportRow {
  firstName: string;
  lastName?: string | null | undefined;
  club?: string | null | undefined;
  gender?: 'f' | 'm' | 'd' | null | undefined;
  birthYear?: number | null | undefined;
  licenceNo?: string | null | undefined;
  rating?: number | null | undefined;
  /** Existing person to update instead of creating a new one */
  updateId?: string | undefined;
  /** Competitions to enter the player in; doubles take the player without a partner (pair draw) */
  competitionIds: string[];
}

export interface ImportReport {
  created: number;
  updated: number;
  entered: number;
  /** Entries that were left out, with the row (0-based) and why */
  skipped: { row: number; competitionId: string; reason: 'alreadyDrawn' | 'alreadyEntered' }[];
  /** Competitions that got new entries */
  competitionIds: string[];
}

/**
 * Creates or updates the persons of an import and enters them in their competitions, all or nothing (run it in a
 * transaction). Unknown persons or competitions are input errors; entries that cannot be made because the
 * competition is drawn or the player is already entered are skipped and reported, so an import can be repeated.
 */
export async function importPersons(
  tx: Executor,
  eventId: string,
  rows: readonly ImportRow[],
  status: 'registered' | 'present',
): Promise<ImportReport> {
  const [eventCompetitions, eventPersons] = await Promise.all([
    tx.select({ id: competitions.id, draw: competitions.draw }).from(competitions).where(eq(competitions.eventId, eventId)),
    tx.select({ id: persons.id }).from(persons).where(eq(persons.eventId, eventId)),
  ]);
  const competitionById = new Map(eventCompetitions.map((c) => [c.id, c]));
  const personIds = new Set(eventPersons.map((p) => p.id));

  rows.forEach((row, index) => {
    if (row.updateId !== undefined && !personIds.has(row.updateId)) throw badRequest('unknownPerson', { row: index });
    const unknown = row.competitionIds.find((id) => !competitionById.has(id));
    if (unknown) throw badRequest('unknownCompetition', { row: index, competitionId: unknown });
  });
  const updates = rows.flatMap((row) => (row.updateId ? [row.updateId] : []));
  if (new Set(updates).size !== updates.length) throw badRequest('duplicateUpdate');

  const report: ImportReport = { created: 0, updated: 0, entered: 0, skipped: [], competitionIds: [] };
  // Rows written in one transaction would share their creation time; one millisecond apart, lists keep the file's order.
  const start = Date.now();
  let tick = 0;
  const nextCreatedAt = () => new Date(start + tick++);
  const personOfRow: string[] = [];
  for (const row of rows) {
    const { updateId, competitionIds: _, ...fields } = row;
    if (updateId) {
      // Only what the file contains is changed; columns that were not imported stay as they are.
      const set = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
      await tx.update(persons).set(set).where(eq(persons.id, updateId));
      personOfRow.push(updateId);
      report.updated++;
    } else {
      const [created] = await tx.insert(persons).values({ ...fields, eventId, createdAt: nextCreatedAt() }).returning({ id: persons.id });
      personOfRow.push(created!.id);
      report.created++;
    }
  }

  const wanted = [...new Set(rows.flatMap((r) => r.competitionIds))];
  if (wanted.length === 0) return report;
  const existing = await tx
    .select({ competitionId: entries.competitionId, personId: entryMembers.personId })
    .from(entryMembers)
    .innerJoin(entries, eq(entries.id, entryMembers.entryId))
    .where(and(inArray(entries.competitionId, wanted), inArray(entryMembers.personId, personOfRow)));
  const entered = new Set(existing.map((e) => `${e.competitionId}:${e.personId}`));

  const touched = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const personId = personOfRow[index]!;
    for (const competitionId of new Set(row.competitionIds)) {
      if (competitionById.get(competitionId)!.draw) {
        report.skipped.push({ row: index, competitionId, reason: 'alreadyDrawn' });
        continue;
      }
      if (entered.has(`${competitionId}:${personId}`)) {
        report.skipped.push({ row: index, competitionId, reason: 'alreadyEntered' });
        continue;
      }
      const [entry] = await tx.insert(entries).values({ competitionId, status, createdAt: nextCreatedAt() }).returning({ id: entries.id });
      await tx.insert(entryMembers).values({ entryId: entry!.id, personId, position: 0 });
      entered.add(`${competitionId}:${personId}`);
      touched.add(competitionId);
      report.entered++;
    }
  }
  report.competitionIds = [...touched];
  return report;
}
