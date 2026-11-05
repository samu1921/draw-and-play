import { randomUUID } from 'node:crypto';
import { buildStructure, DOMAIN_VERSION, SPORT_IDS, validateDraw, type Draw } from '@draw-and-play/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { generateViewerCode } from '../auth/viewers.js';
import type { Executor } from '../db/client.js';
import { assets, competitions, displayProfiles, entries, entryMembers, eventTables, events, matches, persons, type EventSettings } from '../db/schema.js';
import { badRequest, parse } from '../errors.js';
import { ASSET_KINDS, MAX_ASSET_BYTES, sniffImage } from './assets.js';
import { displaySettingsSchema, eventSettingsSchema, formatSchema } from '../schemas.js';

/**
 * Export and import of a whole event as one JSON document: a backup of a single event, and the way to move an
 * event between installations (e.g. from the server to a laptop and back). The PIN, device sessions, users and
 * the audit log stay behind. An import always creates a new event with new ids.
 */

export const EXPORT_FORMAT = 'draw-and-play-event';
export const EXPORT_FORMAT_VERSION = 1;

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();

const drawSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('groups'), groups: z.array(z.array(id)) }),
  z.object({ type: z.literal('knockout'), seats: z.array(id.nullable()) }),
]);

const matchRulesSchema = z.object({
  gamesToWin: z.int().min(1).max(7),
  pointsPerGame: z.int().min(1).max(99),
  winBy: z.int().min(1).max(10),
  pointCap: z.int().min(1).max(999).optional(),
});

const resultSchema = z.object({
  winner: z.union([z.literal(0), z.literal(1)]),
  games: z.array(z.tuple([z.int().min(0).max(999), z.int().min(0).max(999)]).readonly()).max(13).readonly(),
  walkover: z.boolean().optional(),
});

export const eventExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: timestamp,
  domainVersion: z.string(),
  event: z.object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(60),
    startsOn: z.iso.date().nullable(),
    endsOn: z.iso.date().nullable(),
    timezone: z.string().min(1).max(64),
    sport: z.enum(SPORT_IDS),
    settings: eventSettingsSchema,
  }),
  tables: z.array(z.object({ id, name: z.string().trim().min(1).max(20), sortOrder: z.int() })).min(1).max(64),
  persons: z
    .array(
      z.object({
        id,
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80).nullable(),
        club: z.string().max(120).nullable(),
        gender: z.enum(['f', 'm', 'd']).nullable(),
        birthYear: z.int().min(1900).max(2100).nullable(),
        licenceNo: z.string().max(40).nullable(),
        rating: z.int().min(0).max(4000).nullable(),
        createdAt: timestamp,
      }),
    )
    .max(5000),
  competitions: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(80),
        kind: z.enum(['singles', 'doubles']),
        day: z.iso.date().nullable(),
        matchRules: matchRulesSchema,
        matchMinutes: z.int().min(5).max(240),
        format: formatSchema,
        earliestStart: z.int().min(0).max(1439).nullable(),
        startAfterId: id.nullable(),
        tableIds: z.array(id).min(1).max(64).nullable(),
        color: z.int().min(0).max(7),
        sortOrder: z.int().min(0).max(1000),
        draw: drawSchema.nullable(),
        drawSeed: z.string().max(64).nullable(),
        createdAt: timestamp,
      }),
    )
    .max(200),
  entries: z
    .array(
      z.object({
        id,
        competitionId: id,
        seed: z.int().min(1).max(256).nullable(),
        status: z.enum(['registered', 'present', 'withdrawn']),
        createdAt: timestamp,
        /** Person ids in position order */
        members: z.array(id).min(1).max(2),
      }),
    )
    .max(20000),
  matches: z
    .array(
      z.object({
        competitionId: id,
        matchKey: z.string().min(1).max(40),
        status: z.enum(['scheduled', 'called', 'finished']),
        tableId: id.nullable(),
        calledAt: nullableTimestamp,
        finishedAt: nullableTimestamp,
        result: resultSchema.nullable(),
        sideA: id.nullable(),
        sideB: id.nullable(),
        updatedAt: timestamp,
      }),
    )
    .max(50000),
  displayProfiles: z.array(z.object({ name: z.string().trim().min(1).max(60), settings: displaySettingsSchema })).max(100),
  /** The event's own images (logo, backgrounds), base64; missing in files from before they existed */
  assets: z
    .array(z.object({ id, kind: z.enum(ASSET_KINDS), data: z.base64().max(Math.ceil(MAX_ASSET_BYTES / 3) * 4) }))
    .max(10)
    .optional(),
});

export type EventExport = z.infer<typeof eventExportSchema>;

const iso = (value: Date | null) => (value === null ? null : value.toISOString());

/** Collects everything that belongs to the event into one export document. */
export async function exportEvent(ex: Executor, eventId: string): Promise<EventExport> {
  const [event] = await ex.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new Error(`event ${eventId} not found`);
  const [tableRows, personRows, competitionRows, profileRows, assetRows] = await Promise.all([
    ex.select().from(eventTables).where(eq(eventTables.eventId, eventId)).orderBy(asc(eventTables.sortOrder)),
    ex.select().from(persons).where(eq(persons.eventId, eventId)).orderBy(asc(persons.createdAt), asc(persons.id)),
    ex.select().from(competitions).where(eq(competitions.eventId, eventId)).orderBy(asc(competitions.sortOrder), asc(competitions.createdAt)),
    ex.select().from(displayProfiles).where(eq(displayProfiles.eventId, eventId)).orderBy(asc(displayProfiles.createdAt)),
    ex.select().from(assets).where(eq(assets.eventId, eventId)).orderBy(asc(assets.createdAt)),
  ]);
  const competitionIds = competitionRows.map((c) => c.id);
  const [entryRows, memberRows, matchRows] =
    competitionIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          ex.select().from(entries).where(inArray(entries.competitionId, competitionIds)).orderBy(asc(entries.createdAt), asc(entries.id)),
          ex
            .select({ entryId: entryMembers.entryId, personId: entryMembers.personId, position: entryMembers.position })
            .from(entryMembers)
            .innerJoin(entries, eq(entries.id, entryMembers.entryId))
            .where(inArray(entries.competitionId, competitionIds))
            .orderBy(asc(entryMembers.position)),
          ex.select().from(matches).where(inArray(matches.competitionId, competitionIds)).orderBy(asc(matches.matchKey)),
        ]);
  const membersOf = new Map<string, string[]>();
  for (const m of memberRows) membersOf.set(m.entryId, [...(membersOf.get(m.entryId) ?? []), m.personId]);

  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    domainVersion: DOMAIN_VERSION,
    event: {
      name: event.name,
      slug: event.slug,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      timezone: event.timezone,
      // Only known sports can be stored (see the create schema); the type cannot express that.
      sport: event.sport as EventExport['event']['sport'],
      settings: event.settings,
    },
    tables: tableRows.map((t) => ({ id: t.id, name: t.name, sortOrder: t.sortOrder })),
    persons: personRows.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      club: p.club,
      gender: p.gender,
      birthYear: p.birthYear,
      licenceNo: p.licenceNo,
      rating: p.rating,
      createdAt: p.createdAt.toISOString(),
    })),
    competitions: competitionRows.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      day: c.day,
      matchRules: c.matchRules,
      matchMinutes: c.matchMinutes,
      format: c.format,
      earliestStart: c.earliestStart,
      startAfterId: c.startAfterId,
      tableIds: c.tableIds,
      color: c.color,
      sortOrder: c.sortOrder,
      draw: c.draw,
      drawSeed: c.drawSeed,
      createdAt: c.createdAt.toISOString(),
    })),
    entries: entryRows.map((e) => ({
      id: e.id,
      competitionId: e.competitionId,
      seed: e.seed,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
      members: membersOf.get(e.id) ?? [],
    })),
    matches: matchRows.map((m) => ({
      competitionId: m.competitionId,
      matchKey: m.matchKey,
      status: m.status,
      tableId: m.tableId,
      calledAt: iso(m.calledAt),
      finishedAt: iso(m.finishedAt),
      result: m.result,
      sideA: m.sideA,
      sideB: m.sideB,
      updatedAt: m.updatedAt.toISOString(),
    })),
    displayProfiles: profileRows.map((p) => ({ name: p.name, settings: p.settings })),
    assets: assetRows.map((a) => ({ id: a.id, kind: a.kind, data: a.data.toString('base64') })),
  };
}

/** Rejects a document whose parts do not fit together; `reason` and `at` tell the admin what is wrong. */
const invalid = (reason: string, at: string) => badRequest('invalidImport', { reason, at });

function uniqueIds(items: readonly { id: string }[], at: string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw invalid('duplicateId', `${at}:${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

/** Checks the references and the draws of a parsed export, beyond what the schema can express. */
export function checkEventExport(doc: EventExport): void {
  const tableIds = uniqueIds(doc.tables, 'tables');
  const personIds = uniqueIds(doc.persons, 'persons');
  const competitionIds = uniqueIds(doc.competitions, 'competitions');
  uniqueIds(doc.entries, 'entries');
  if (new Set(doc.tables.map((t) => t.name)).size !== doc.tables.length) throw invalid('duplicateTableName', 'tables');

  for (const c of doc.competitions) {
    if (c.startAfterId !== null && (c.startAfterId === c.id || !competitionIds.has(c.startAfterId))) throw invalid('unknownReference', `competitions:${c.id}:startAfterId`);
    if (c.tableIds?.some((t) => !tableIds.has(t))) throw invalid('unknownReference', `competitions:${c.id}:tableIds`);
  }

  const entriesOf = new Map<string, Set<string>>();
  for (const e of doc.entries) {
    const competition = doc.competitions.find((c) => c.id === e.competitionId);
    if (!competition) throw invalid('unknownReference', `entries:${e.id}:competitionId`);
    if (competition.kind === 'singles' && e.members.length !== 1) throw invalid('wrongMemberCount', `entries:${e.id}`);
    if (new Set(e.members).size !== e.members.length) throw invalid('duplicateMember', `entries:${e.id}`);
    for (const p of e.members) if (!personIds.has(p)) throw invalid('unknownReference', `entries:${e.id}:members`);
    const set = entriesOf.get(e.competitionId) ?? new Set<string>();
    set.add(e.id);
    entriesOf.set(e.competitionId, set);
  }
  for (const c of doc.competitions) {
    const members = doc.entries.filter((e) => e.competitionId === c.id).flatMap((e) => e.members);
    if (new Set(members).size !== members.length) throw invalid('personEnteredTwice', `competitions:${c.id}`);
  }

  const matchKeysOf = new Map<string, Set<string>>();
  for (const c of doc.competitions) {
    if (!c.draw) continue;
    const own = entriesOf.get(c.id) ?? new Set<string>();
    const drawn = c.draw.type === 'groups' ? c.draw.groups.flat() : c.draw.seats.filter((s): s is string => s !== null);
    if (drawn.some((e) => !own.has(e))) throw invalid('unknownReference', `competitions:${c.id}:draw`);
    let keys: Set<string>;
    try {
      const structure = buildStructure(c.format, drawn.length);
      if (validateDraw(structure, c.draw as Draw) !== null) throw new Error('draw does not fit');
      keys = new Set(structure.matches.map((m) => m.id));
    } catch {
      throw invalid('invalidDraw', `competitions:${c.id}`);
    }
    matchKeysOf.set(c.id, keys);
  }

  const seenMatches = new Set<string>();
  const calledTables = new Set<string>();
  for (const m of doc.matches) {
    const at = `matches:${m.competitionId}:${m.matchKey}`;
    const keys = matchKeysOf.get(m.competitionId);
    if (!keys) throw invalid('unknownReference', `${at}:competitionId`);
    if (!keys.has(m.matchKey)) throw invalid('unknownMatch', at);
    if (seenMatches.has(`${m.competitionId}/${m.matchKey}`)) throw invalid('duplicateMatch', at);
    seenMatches.add(`${m.competitionId}/${m.matchKey}`);
    if (m.tableId !== null && !tableIds.has(m.tableId)) throw invalid('unknownReference', `${at}:tableId`);
    const own = entriesOf.get(m.competitionId)!;
    for (const side of [m.sideA, m.sideB]) if (side !== null && !own.has(side)) throw invalid('unknownReference', `${at}:sides`);
    if (m.status === 'finished' && m.result === null) throw invalid('missingResult', at);
    if (m.status === 'called') {
      if (m.tableId === null) throw invalid('missingTable', at);
      if (calledTables.has(m.tableId)) throw invalid('tableBusy', at);
      calledTables.add(m.tableId);
    }
  }

  for (const p of doc.displayProfiles) {
    if (p.settings.competitionIds?.some((c) => !competitionIds.has(c))) throw invalid('unknownReference', `displayProfiles:${p.name}`);
  }
}

/** Parses and checks an uploaded document. Unknown formats get their own error code, so the UI can say so. */
export function parseEventExport(body: unknown): EventExport {
  const head = z.object({ format: z.string(), formatVersion: z.number() }).safeParse(body);
  if (!head.success || head.data.format !== EXPORT_FORMAT || head.data.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw badRequest('unsupportedFormat', head.success ? { format: head.data.format, formatVersion: head.data.formatVersion } : undefined);
  }
  const doc = parse(eventExportSchema, body);
  checkEventExport(doc);
  return doc;
}

/**
 * Creates a new event from a checked export document, with new ids for everything. Ids inside JSON columns
 * (draws, table restrictions, display filters) are rewritten too. Must run inside a transaction.
 */
export async function importEvent(tx: Executor, doc: EventExport, slug: string): Promise<typeof events.$inferSelect> {
  // New ids sort like the old ones, so lists ordered by id (as the tie-breaker for equal creation times) keep their order.
  const oldIds = [...doc.tables, ...doc.persons, ...doc.competitions, ...doc.entries].map((x) => x.id).sort();
  const newIds = oldIds.map(() => randomUUID()).sort();
  const ids = new Map(oldIds.map((old, i) => [old, newIds[i]!]));
  const map = (old: string) => {
    const next = ids.get(old);
    if (!next) throw new Error(`unchecked reference ${old}`);
    return next;
  };
  const mapNullable = (old: string | null) => (old === null ? null : map(old));

  const [event] = await tx
    .insert(events)
    .values({
      name: doc.event.name,
      slug,
      startsOn: doc.event.startsOn,
      endsOn: doc.event.endsOn,
      timezone: doc.event.timezone,
      sport: doc.event.sport,
      settings: doc.event.settings,
      // The code is not part of the file; an imported event gets a new one, so it is never open by accident
      viewerCode: generateViewerCode(),
    })
    .returning();
  const eventId = event!.id;
  const settings = await importAssets(tx, doc, eventId);
  if (settings) event!.settings = settings;

  await tx.insert(eventTables).values(doc.tables.map((t) => ({ id: map(t.id), eventId, name: t.name, sortOrder: t.sortOrder })));

  if (doc.persons.length > 0) {
    await tx.insert(persons).values(
      doc.persons.map((p) => ({
        id: map(p.id),
        eventId,
        firstName: p.firstName,
        lastName: p.lastName,
        club: p.club,
        gender: p.gender,
        birthYear: p.birthYear,
        licenceNo: p.licenceNo,
        rating: p.rating,
        createdAt: new Date(p.createdAt),
      })),
    );
  }

  if (doc.competitions.length > 0) {
    // Inserted without start dependencies first, because a competition may depend on one that comes later.
    await tx.insert(competitions).values(
      doc.competitions.map((c) => ({
        id: map(c.id),
        eventId,
        name: c.name,
        kind: c.kind,
        day: c.day,
        matchRules: c.matchRules,
        matchMinutes: c.matchMinutes,
        format: c.format,
        earliestStart: c.earliestStart,
        startAfterId: null,
        tableIds: c.tableIds?.map(map) ?? null,
        color: c.color,
        sortOrder: c.sortOrder,
        draw: remapDraw(c.draw, map),
        drawSeed: c.drawSeed,
        createdAt: new Date(c.createdAt),
      })),
    );
    for (const c of doc.competitions) {
      if (c.startAfterId !== null) await tx.update(competitions).set({ startAfterId: map(c.startAfterId) }).where(eq(competitions.id, map(c.id)));
    }
  }

  if (doc.entries.length > 0) {
    await tx.insert(entries).values(
      doc.entries.map((e) => ({ id: map(e.id), competitionId: map(e.competitionId), seed: e.seed, status: e.status, createdAt: new Date(e.createdAt) })),
    );
    await tx.insert(entryMembers).values(doc.entries.flatMap((e) => e.members.map((p, position) => ({ entryId: map(e.id), personId: map(p), position }))));
  }

  if (doc.matches.length > 0) {
    await tx.insert(matches).values(
      doc.matches.map((m) => ({
        competitionId: map(m.competitionId),
        matchKey: m.matchKey,
        status: m.status,
        tableId: mapNullable(m.tableId),
        calledAt: m.calledAt === null ? null : new Date(m.calledAt),
        finishedAt: m.finishedAt === null ? null : new Date(m.finishedAt),
        result: m.result,
        sideA: mapNullable(m.sideA),
        sideB: mapNullable(m.sideB),
        updatedAt: new Date(m.updatedAt),
      })),
    );
  }

  if (doc.displayProfiles.length > 0) {
    await tx.insert(displayProfiles).values(
      doc.displayProfiles.map((p) => ({
        eventId,
        name: p.name,
        settings: { ...p.settings, ...(p.settings.competitionIds && { competitionIds: p.settings.competitionIds.map(map) }) },
      })),
    );
  }

  return event!;
}

function remapDraw(draw: EventExport['competitions'][number]['draw'], map: (old: string) => string): Draw | null {
  if (draw === null) return null;
  return draw.type === 'groups' ? { type: 'groups', groups: draw.groups.map((g) => g.map(map)) } : { type: 'knockout', seats: draw.seats.map((s) => (s === null ? null : map(s))) };
}

/**
 * Stores the event's images under new ids and points the branding and the certificate template at them; a reference to an image that is not in
 * the file (or not a valid image) is dropped, so the event falls back to the installation's look.
 */
async function importAssets(tx: Executor, doc: EventExport, eventId: string): Promise<EventSettings | null> {
  const newIds = new Map<string, string>();
  for (const asset of doc.assets ?? []) {
    const data = Buffer.from(asset.data, 'base64');
    const mime = sniffImage(data);
    if (!mime || data.length > MAX_ASSET_BYTES) continue;
    const [row] = await tx.insert(assets).values({ eventId, kind: asset.kind, mime, data, size: data.length }).returning({ id: assets.id });
    newIds.set(asset.id, row!.id);
  }
  const { branding, certificate } = doc.event.settings;
  if (!branding && !certificate) return null;
  const remap = (old: string | null | undefined) => (old ? (newIds.get(old) ?? null) : (old ?? null));
  const settings: EventSettings = {
    ...doc.event.settings,
    ...(branding && { branding: { ...branding, logoId: remap(branding.logoId), displayBackgroundId: remap(branding.displayBackgroundId) } }),
    ...(certificate && { certificate: { ...certificate, backgroundId: remap(certificate.backgroundId) } }),
  };
  await tx.update(events).set({ settings }).where(eq(events.id, eventId));
  return settings;
}
