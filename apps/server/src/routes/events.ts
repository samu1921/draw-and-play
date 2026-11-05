import { DEFAULT_SPORT, SPORT_IDS } from '@draw-and-play/domain';
import { and, asc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Executor } from '../db/client.js';
import { auditLog, competitions, entryMembers, eventTables, events, matches, persons } from '../db/schema.js';
import { conflict, notFound, parse } from '../errors.js';
import { eventSettingsSchema } from '../schemas.js';
import { competitionSummary, personView } from '../services/competitions.js';
import { importPersons } from '../services/personImport.js';
import { generateViewerCode } from '../auth/viewers.js';
import { legalLinks } from '../legal.js';
import { actorOf, isAdmin, requireAdmin, requireStaff } from './auth.js';
import type { RouteDeps } from './deps.js';
import { requireViewer } from './viewers.js';

const uuid = z.uuid();
const isoDate = z.iso.date();

const createEventBody = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60)
    .optional(),
  startsOn: isoDate.optional(),
  /** Fixed at creation: results and standings of existing matches depend on it */
  sport: z.enum(SPORT_IDS).optional(),
  endsOn: isoDate.optional(),
  tableCount: z.int().min(1).max(64).default(4),
});

const updateEventBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startsOn: isoDate.nullable().optional(),
  endsOn: isoDate.nullable().optional(),
  settings: eventSettingsSchema.optional(),
});

const tablesBody = z.object({ names: z.array(z.string().trim().min(1).max(20)).min(1).max(64) });

const personBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  /** Optional; an empty string clears it */
  lastName: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  club: z.string().trim().max(120).nullable().optional(),
  gender: z.enum(['f', 'm', 'd']).nullable().optional(),
  birthYear: z.int().min(1900).max(2100).nullable().optional(),
  licenceNo: z.string().trim().max(40).nullable().optional(),
  rating: z.int().min(0).max(4000).nullable().optional(),
});

const importBody = z.object({
  /** Status of the new entries: on the tournament day everyone in the file is usually present */
  status: z.enum(['registered', 'present']).default('registered'),
  rows: z
    .array(personBody.extend({ updateId: uuid.optional(), competitionIds: z.array(uuid).max(50).default([]) }))
    .min(1)
    .max(1000),
});

function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return base || 'event';
}

/** Event as returned by the API: the PIN hash never leaves the server */
export function eventView(event: typeof events.$inferSelect) {
  const { pinHash, pinVersion: _pinVersion, viewerCodeVersion: _viewerCodeVersion, ...rest } = event;
  return { ...rest, pinEnabled: pinHash !== null };
}

/** Events are addressed by id or slug (the slug makes public URLs readable). */
export async function findEvent(ex: Executor, ref: string) {
  const condition = uuid.safeParse(ref).success ? or(eq(events.id, ref), eq(events.slug, ref)) : eq(events.slug, ref);
  const [row] = await ex.select().from(events).where(condition).limit(1);
  if (!row) throw notFound('event');
  return row;
}

export async function eventRoutes(app: FastifyInstance, { db, broadcaster, legal }: RouteDeps) {
  // Open streams are ended on shutdown; otherwise the server would wait for every client to disconnect.
  const streams = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const res of streams) res.end();
  });

  const publish = (eventId: string, type: 'event' | 'tables' | 'persons', id = eventId) => broadcaster.publish({ eventId, type, id });

  app.get('/api/events', { preHandler: requireStaff }, async () => {
    return { events: (await db.select().from(events).orderBy(asc(events.startsOn), asc(events.name))).map(eventView) };
  });

  app.post('/api/events', { preHandler: requireAdmin }, async (request, reply) => {
    const body = parse(createEventBody, request.body);
    const slug = body.slug ?? `${slugify(body.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const created = await db.transaction(async (tx) => {
      const [taken] = await tx.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
      if (taken) throw conflict('slugTaken');
      const [event] = await tx
        .insert(events)
        .values({
          name: body.name,
          slug,
          sport: body.sport ?? DEFAULT_SPORT,
          startsOn: body.startsOn ?? null,
          endsOn: body.endsOn ?? null,
          // New events start with their public views behind a viewer code (names of players, often minors)
          viewerCode: generateViewerCode(),
        })
        .returning();
      await tx
        .insert(eventTables)
        .values(Array.from({ length: body.tableCount }, (_, i) => ({ eventId: event!.id, name: String(i + 1), sortOrder: i })));
      await tx.insert(auditLog).values({ eventId: event!.id, actor: actorOf(request), action: 'create', entityType: 'event', entityId: event!.id });
      return event!;
    });
    return reply.code(201).send({ event: eventView(created) });
  });

  /** Public overview: event, tables and competitions */
  app.get('/api/events/:eventRef', async (request) => {
    const { eventRef } = request.params as { eventRef: string };
    const event = await findEvent(db, eventRef);
    await requireViewer(request, db, event);
    const [tables, comps] = await Promise.all([
      db.select().from(eventTables).where(eq(eventTables.eventId, event.id)).orderBy(asc(eventTables.sortOrder)),
      db.select().from(competitions).where(eq(competitions.eventId, event.id)).orderBy(asc(competitions.sortOrder), asc(competitions.createdAt)),
    ]);
    return {
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        timezone: event.timezone,
        sport: event.sport,
        settings: event.settings,
        pinEnabled: event.pinHash !== null,
        viewerProtected: event.viewerCode !== null,
        legal: legalLinks(event.settings, legal),
        // Admins need the code for the notice and the display links
        ...(isAdmin(request) && { viewerCode: event.viewerCode }),
      },
      tables: tables.map((t) => ({ id: t.id, name: t.name, sortOrder: t.sortOrder })),
      competitions: comps.map(competitionSummary),
    };
  });

  app.patch('/api/events/:eventId', { preHandler: requireAdmin }, async (request) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const body = parse(updateEventBody, request.body);
    const [updated] = await db
      .update(events)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.startsOn !== undefined && { startsOn: body.startsOn }),
        ...(body.endsOn !== undefined && { endsOn: body.endsOn }),
        ...(body.settings && { settings: { ...event.settings, ...body.settings } }),
      })
      .where(eq(events.id, event.id))
      .returning();
    publish(event.id, 'event');
    return { event: eventView(updated!) };
  });

  app.delete('/api/events/:eventId', { preHandler: requireAdmin }, async (request, reply) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    await db.delete(events).where(eq(events.id, event.id));
    publish(event.id, 'event');
    return reply.code(204).send();
  });

  /** Replaces the table list by name. Tables holding a called match cannot be removed. */
  app.put('/api/events/:eventId/tables', { preHandler: requireAdmin }, async (request) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const { names } = parse(tablesBody, request.body);
    if (new Set(names).size !== names.length) throw conflict('duplicateTableName');
    const tables = await db.transaction(async (tx) => {
      const existing = await tx.select().from(eventTables).where(eq(eventTables.eventId, event.id));
      const removed = existing.filter((t) => !names.includes(t.name)).map((t) => t.id);
      if (removed.length > 0) {
        const [inUse] = await tx
          .select({ id: matches.id })
          .from(matches)
          .where(and(inArray(matches.tableId, removed), eq(matches.status, 'called')))
          .limit(1);
        if (inUse) throw conflict('tableInUse');
        await tx.delete(eventTables).where(and(eq(eventTables.eventId, event.id), notInArray(eventTables.name, names)));
      }
      for (const [sortOrder, name] of names.entries()) {
        const found = existing.find((t) => t.name === name);
        if (found) await tx.update(eventTables).set({ sortOrder }).where(eq(eventTables.id, found.id));
        else await tx.insert(eventTables).values({ eventId: event.id, name, sortOrder });
      }
      return tx.select().from(eventTables).where(eq(eventTables.eventId, event.id)).orderBy(asc(eventTables.sortOrder));
    });
    publish(event.id, 'tables');
    return { tables };
  });

  // --- Persons (staff only, i.e. admins and the registration desk: they hold personal data) ---

  app.get('/api/events/:eventId/persons', { preHandler: requireStaff }, async (request) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const rows = await db.select().from(persons).where(eq(persons.eventId, event.id))
      // Without a last name, the first name takes its place in the alphabet.
      .orderBy(asc(sql`coalesce(${persons.lastName}, ${persons.firstName})`), asc(persons.firstName), asc(persons.id));
    return { persons: rows.map((p) => personView(p, event.settings, 'admin')) };
  });

  app.post('/api/events/:eventId/persons', { preHandler: requireStaff }, async (request, reply) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const body = parse(personBody, request.body);
    const [person] = await db.insert(persons).values({ ...body, eventId: event.id }).returning();
    publish(event.id, 'persons', person!.id);
    return reply.code(201).send({ person: personView(person!, event.settings, 'admin') });
  });

  /** Many persons at once (CSV import in the browser), optionally entered in competitions right away */
  app.post('/api/events/:eventId/persons/import', { preHandler: requireStaff }, async (request) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const body = parse(importBody, request.body);
    const report = await db.transaction(async (tx) => {
      const result = await importPersons(tx, event.id, body.rows, body.status);
      await tx.insert(auditLog).values({
        eventId: event.id,
        actor: actorOf(request),
        action: 'importPersons',
        entityType: 'event',
        entityId: event.id,
        data: { created: result.created, updated: result.updated, entered: result.entered },
      });
      return result;
    });
    publish(event.id, 'persons');
    for (const id of report.competitionIds) broadcaster.publish({ eventId: event.id, type: 'competition', id });
    const { competitionIds: _, ...rest } = report;
    return rest;
  });

  app.patch('/api/persons/:personId', { preHandler: requireStaff }, async (request) => {
    const { personId } = request.params as { personId: string };
    const body = parse(personBody.partial(), request.body);
    const [person] = await db.update(persons).set(body).where(eq(persons.id, parse(uuid, personId))).returning();
    if (!person) throw notFound('person');
    const event = await findEvent(db, person.eventId);
    publish(event.id, 'persons', person.id);
    return { person: personView(person, event.settings, 'admin') };
  });

  app.delete('/api/persons/:personId', { preHandler: requireStaff }, async (request, reply) => {
    const personId = parse(uuid, (request.params as { personId: string }).personId);
    const person = await db.transaction(async (tx) => {
      const [entered] = await tx.select({ entryId: entryMembers.entryId }).from(entryMembers).where(eq(entryMembers.personId, personId)).limit(1);
      if (entered) throw conflict('personHasEntries');
      const [deleted] = await tx.delete(persons).where(eq(persons.id, personId)).returning();
      if (!deleted) throw notFound('person');
      return deleted;
    });
    publish(person.eventId, 'persons', person.id);
    return reply.code(204).send();
  });

  // --- Live updates ---

  /** Server-Sent Events: one "change" message per modification, plus a heartbeat against idle proxies. */
  app.get('/api/events/:eventRef/stream', async (request, reply) => {
    const event = await findEvent(db, (request.params as { eventRef: string }).eventRef);
    // Refused before the stream starts; the client opens it again once it may read
    await requireViewer(request, db, event);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n\nevent: ready\ndata: ${JSON.stringify({ eventId: event.id })}\n\n`);
    const unsubscribe = broadcaster.subscribe(event.id, (message) => {
      res.write(`event: change\ndata: ${JSON.stringify(message)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    streams.add(res);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      streams.delete(res);
    });
  });
}
