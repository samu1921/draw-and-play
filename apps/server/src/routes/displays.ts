import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { displayProfiles, users, type DisplaySettings } from '../db/schema.js';
import { conflict, notFound, parse } from '../errors.js';
import { requireAdmin } from './auth.js';
import type { RouteDeps } from './deps.js';
import { findEvent } from './events.js';

const uuid = z.uuid();

export const displayDefaults: DisplaySettings = {
  slideSeconds: 20,
  tables: true,
  next: true,
  entries: true,
  competitionIds: null,
  todayOnly: false,
  liveDraw: true,
};

const settingsSchema = z
  .object({
    slideSeconds: z.int().min(5).max(600),
    tables: z.boolean(),
    next: z.boolean(),
    entries: z.boolean(),
    competitionIds: z.array(uuid).max(64).nullable(),
    todayOnly: z.boolean(),
    liveDraw: z.boolean(),
  })
  .partial();

const name = z.string().trim().min(1).max(60);
const createBody = z.object({ name, settings: settingsSchema.optional() });
const updateBody = z.object({ name: name.optional(), settings: settingsSchema.optional(), version: z.int() });

type ProfileRow = typeof displayProfiles.$inferSelect;

/** Stored settings on top of the defaults, so profiles keep working when new settings are added */
const profileView = (row: ProfileRow, createdBy?: string | null) => ({
  id: row.id,
  eventId: row.eventId,
  name: row.name,
  settings: { ...displayDefaults, ...row.settings },
  version: row.version,
  ...(createdBy !== undefined && { createdBy }),
});

export async function displayRoutes(app: FastifyInstance, { db, broadcaster }: RouteDeps) {
  const publish = (eventId: string, id: string) => broadcaster.publish({ eventId, type: 'display', id });
  const idParam = (params: unknown) => parse(uuid, (params as { profileId: string }).profileId);

  async function load(id: string) {
    const [row] = await db.select().from(displayProfiles).where(eq(displayProfiles.id, id)).limit(1);
    if (!row) throw notFound('display');
    return row;
  }

  /** All profiles of the event, with the name of whoever created them */
  app.get('/api/events/:eventId/displays', { preHandler: requireAdmin }, async (request) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const rows = await db
      .select({ profile: displayProfiles, createdBy: users.username })
      .from(displayProfiles)
      .leftJoin(users, eq(users.id, displayProfiles.createdBy))
      .where(eq(displayProfiles.eventId, event.id))
      .orderBy(asc(displayProfiles.createdAt));
    return { displays: rows.map((r) => profileView(r.profile, r.createdBy)) };
  });

  app.post('/api/events/:eventId/displays', { preHandler: requireAdmin }, async (request, reply) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const body = parse(createBody, request.body);
    const [row] = await db
      .insert(displayProfiles)
      .values({ eventId: event.id, name: body.name, settings: body.settings ?? {}, createdBy: request.user!.id })
      .returning();
    publish(event.id, row!.id);
    return reply.code(201).send({ display: profileView(row!, request.user!.username) });
  });

  /** Public: the screen showing the profile has no login */
  app.get('/api/displays/:profileId', async (request) => ({ display: profileView(await load(idParam(request.params))) }));

  app.patch('/api/displays/:profileId', { preHandler: requireAdmin }, async (request) => {
    const id = idParam(request.params);
    const body = parse(updateBody, request.body);
    const current = await load(id);
    if (current.version !== body.version) throw conflict('versionConflict', { current: current.version });
    const [row] = await db
      .update(displayProfiles)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.settings && { settings: { ...current.settings, ...body.settings } }),
        version: current.version + 1,
      })
      .where(and(eq(displayProfiles.id, id), eq(displayProfiles.version, body.version)))
      .returning();
    if (!row) throw conflict('versionConflict');
    publish(row.eventId, id);
    return { display: profileView(row) };
  });

  app.delete('/api/displays/:profileId', { preHandler: requireAdmin }, async (request, reply) => {
    const row = await load(idParam(request.params));
    await db.delete(displayProfiles).where(eq(displayProfiles.id, row.id));
    publish(row.eventId, row.id);
    return reply.code(204).send();
  });
}
