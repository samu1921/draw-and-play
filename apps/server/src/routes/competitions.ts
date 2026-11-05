import { getSportProfile } from '@draw-and-play/domain';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { competitions, entries, entryMembers, eventTables, events, matches, persons } from '../db/schema.js';
import { ApiError, badRequest, conflict, notFound, parse } from '../errors.js';
import { formatSchema } from '../schemas.js';
import {
  callMatch,
  drawCompetition,
  drawDoublesPairs,
  eventOfMatch,
  recordResult,
  reinstateEntry,
  splitDoublesPairs,
  uncallMatch,
  undoDraw,
  withdrawEntry,
  type CommandContext,
} from '../services/commands.js';
import { competitionSummary, competitionView, eventSettings, loadCompetition, loadCompetitionState } from '../services/competitions.js';
import { actorOf, isAdmin, requireAdmin, requireStaff } from './auth.js';
import type { RouteDeps } from './deps.js';
import { deviceOf } from './devices.js';
import { findEvent } from './events.js';
import { requireViewer } from './viewers.js';

const uuid = z.uuid();

const competitionFields = {
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['singles', 'doubles']),
  day: z.iso.date().nullable(),
  gamesToWin: z.int().min(1).max(7),
  matchMinutes: z.int().min(5).max(240),
  format: formatSchema,
  earliestStart: z.int().min(0).max(1439).nullable(),
  startAfterId: uuid.nullable(),
  tableIds: z.array(uuid).min(1).max(64).nullable(),
  color: z.int().min(0).max(7),
  sortOrder: z.int().min(0).max(1000),
};

const createCompetitionBody = z.object({
  ...competitionFields,
  kind: competitionFields.kind.default('singles'),
  gamesToWin: competitionFields.gamesToWin.default(3),
  day: competitionFields.day.optional(),
  matchMinutes: competitionFields.matchMinutes.optional(),
  earliestStart: competitionFields.earliestStart.optional(),
  startAfterId: competitionFields.startAfterId.optional(),
  tableIds: competitionFields.tableIds.optional(),
  color: competitionFields.color.optional(),
  sortOrder: competitionFields.sortOrder.optional(),
});

const updateCompetitionBody = z.object({ ...competitionFields, version: z.int() }).partial().required({ version: true });

const entryBody = z.object({
  personIds: z.array(uuid).min(1).max(2),
  seed: z.int().min(1).max(256).nullable().optional(),
  status: z.enum(['registered', 'present', 'withdrawn']).optional(),
});
const updateEntryBody = z.object({
  seed: z.int().min(1).max(256).nullable().optional(),
  status: z.enum(['registered', 'present', 'withdrawn']).optional(),
});

const drawSeed = z.string().trim().min(1).max(64).optional();
const drawBody = z.object({
  seed: drawSeed,
  /** Entries from the top of the seeding list that are seeded */
  seedCount: z.int().min(0).max(256).optional(),
  /** fixed: seeds keep their place by seed number; drawn: seeds are drawn among each other */
  seedPlacement: z.enum(['fixed', 'drawn']).optional(),
});
const pairDrawBody = z.object({ seed: drawSeed, mode: z.enum(['seeded', 'random']).default('seeded') });
const splitPairsBody = z.object({ entryIds: z.array(uuid).min(1).max(256).optional() });

const versionBody = z.object({ version: z.int() });
const callBody = z.object({ tableId: uuid, version: z.int() });
const resultBody = z
  .object({ notation: z.string().max(200).optional(), walkoverWinner: z.union([z.literal(0), z.literal(1)]).optional(), version: z.int() })
  .refine((b) => (b.notation === undefined) !== (b.walkoverWinner === undefined), { message: 'notationOrWalkover' });

export async function competitionRoutes(app: FastifyInstance, { db, broadcaster }: RouteDeps) {
  const ctx = (request: Parameters<typeof actorOf>[0]): CommandContext => ({ db, broadcaster, actor: actorOf(request) });
  const publish = (eventId: string, id: string) => broadcaster.publish({ eventId, type: 'competition', id });
  const idParam = (params: unknown, key: string) => parse(uuid, (params as Record<string, string>)[key]);

  /** Start dependencies and table restrictions must point into the same event. */
  async function checkReferences(eventId: string, body: { startAfterId?: string | null | undefined; tableIds?: string[] | null | undefined }, selfId?: string) {
    if (body.startAfterId) {
      if (body.startAfterId === selfId) throw badRequest('startAfterSelf');
      const [other] = await db
        .select({ id: competitions.id })
        .from(competitions)
        .where(and(eq(competitions.id, body.startAfterId), eq(competitions.eventId, eventId)))
        .limit(1);
      if (!other) throw badRequest('unknownCompetition');
    }
    if (body.tableIds) {
      const found = await db
        .select({ id: eventTables.id })
        .from(eventTables)
        .where(and(eq(eventTables.eventId, eventId), inArray(eventTables.id, body.tableIds)));
      if (found.length !== new Set(body.tableIds).size) throw badRequest('unknownTable');
    }
  }

  app.post('/api/events/:eventId/competitions', { preHandler: requireAdmin }, async (request, reply) => {
    const eventId = idParam(request.params, 'eventId');
    const body = parse(createCompetitionBody, request.body);
    const [event] = await db.select({ sport: events.sport }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw notFound('event');
    await checkReferences(eventId, body);
    const sport = getSportProfile(event.sport);
    const matchRules = { ...sport.defaultMatchRules, gamesToWin: body.gamesToWin };
    const existing = await db.select({ color: competitions.color }).from(competitions).where(eq(competitions.eventId, eventId));
    const usedColors = new Set(existing.map((c) => c.color));
    const [created] = await db
      .insert(competitions)
      .values({
        eventId,
        name: body.name,
        kind: body.kind,
        day: body.day ?? null,
        matchRules,
        matchMinutes: body.matchMinutes ?? sport.estimateMatchMinutes(matchRules),
        format: body.format,
        earliestStart: body.earliestStart ?? null,
        startAfterId: body.startAfterId ?? null,
        tableIds: body.tableIds ?? null,
        color: body.color ?? [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !usedColors.has(c)) ?? 7,
        sortOrder: body.sortOrder ?? existing.length,
      })
      .returning()
      .catch((error: { cause?: { code?: string } }) => {
        if (error.cause?.code === '23503') throw notFound('event');
        throw error;
      });
    publish(eventId, created!.id);
    return reply.code(201).send({ competition: competitionSummary(created!) });
  });

  app.patch('/api/competitions/:competitionId', { preHandler: requireAdmin }, async (request) => {
    const id = idParam(request.params, 'competitionId');
    const body = parse(updateCompetitionBody, request.body);
    const current = await loadCompetition(db, id);
    if (current.version !== body.version) throw conflict('versionConflict', { current: current.version });
    if (current.draw && (body.format !== undefined || body.kind !== undefined)) throw conflict('alreadyDrawn');
    await checkReferences(current.eventId, body, id);
    const { version, gamesToWin, ...fields } = body;
    const [updated] = await db
      .update(competitions)
      .set({
        ...fields,
        ...(gamesToWin !== undefined && { matchRules: { ...current.matchRules, gamesToWin } }),
        version: version + 1,
      })
      .where(and(eq(competitions.id, id), eq(competitions.version, version)))
      .returning();
    if (!updated) throw conflict('versionConflict');
    publish(current.eventId, id);
    return { competition: competitionSummary(updated) };
  });

  app.delete('/api/competitions/:competitionId', { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParam(request.params, 'competitionId');
    const current = await loadCompetition(db, id);
    const [started] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.competitionId, id), ne(matches.status, 'scheduled')))
      .limit(1);
    if (started) throw conflict('matchesStarted');
    await db.delete(competitions).where(eq(competitions.id, id));
    publish(current.eventId, id);
    return reply.code(204).send();
  });

  /** Live state; signed-in admins additionally see seeds and the draw seed. */
  app.get('/api/competitions/:competitionId/state', async (request) => {
    const loaded = await loadCompetitionState(db, idParam(request.params, 'competitionId'));
    const event = await findEvent(db, loaded.competition.eventId);
    await requireViewer(request, db, event);
    return competitionView(loaded, event.settings, request.user ? 'admin' : 'public');
  });

  // --- Entries ---

  app.post('/api/competitions/:competitionId/entries', { preHandler: requireStaff }, async (request, reply) => {
    const id = idParam(request.params, 'competitionId');
    const body = parse(entryBody, request.body);
    const competition = await loadCompetition(db, id);
    if (competition.draw) throw conflict('alreadyDrawn');
    // Doubles take a pair, or a single player who gets a partner in the pair draw.
    const allowed = competition.kind === 'doubles' ? [1, 2] : [1];
    const count = new Set(body.personIds).size;
    if (count !== body.personIds.length || !allowed.includes(count)) throw badRequest('wrongMemberCount', { expected: allowed.at(-1) });
    const found = await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.eventId, competition.eventId), inArray(persons.id, body.personIds)));
    if (found.length !== count) throw badRequest('unknownPerson');
    const [already] = await db
      .select({ personId: entryMembers.personId })
      .from(entryMembers)
      .innerJoin(entries, eq(entries.id, entryMembers.entryId))
      .where(and(eq(entries.competitionId, id), inArray(entryMembers.personId, body.personIds)))
      .limit(1);
    if (already) throw conflict('alreadyEntered', { personId: already.personId });

    const entry = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(entries)
        .values({ competitionId: id, seed: body.seed ?? null, status: body.status ?? 'registered' })
        .returning();
      await tx.insert(entryMembers).values(body.personIds.map((personId, position) => ({ entryId: row!.id, personId, position })));
      return row!;
    });
    publish(competition.eventId, id);
    return reply.code(201).send({ entry: { ...entry, personIds: body.personIds } });
  });

  /** After the draw: the remaining matches of the entry become walkovers */
  app.post('/api/entries/:entryId/withdraw', { preHandler: requireAdmin }, async (request) => {
    return withdrawEntry(ctx(request), idParam(request.params, 'entryId'));
  });

  app.post('/api/entries/:entryId/reinstate', { preHandler: requireAdmin }, async (request, reply) => {
    await reinstateEntry(ctx(request), idParam(request.params, 'entryId'));
    return reply.code(204).send();
  });

  app.patch('/api/entries/:entryId', { preHandler: requireStaff }, async (request) => {
    const entryId = idParam(request.params, 'entryId');
    const body = parse(updateEntryBody, request.body);
    const [entry] = await db.select().from(entries).where(eq(entries.id, entryId)).limit(1);
    if (!entry) throw notFound('entry');
    const competition = await loadCompetition(db, entry.competitionId);
    // After the draw the field is fixed: withdrawals are handled as walkovers in the matches instead.
    if (competition.draw && (body.seed !== undefined || body.status === 'withdrawn')) throw conflict('alreadyDrawn');
    const [updated] = await db.update(entries).set(body).where(eq(entries.id, entryId)).returning();
    publish(competition.eventId, competition.id);
    return { entry: updated };
  });

  app.delete('/api/entries/:entryId', { preHandler: requireStaff }, async (request, reply) => {
    const entryId = idParam(request.params, 'entryId');
    const [entry] = await db.select().from(entries).where(eq(entries.id, entryId)).limit(1);
    if (!entry) throw notFound('entry');
    const competition = await loadCompetition(db, entry.competitionId);
    if (competition.draw) throw conflict('alreadyDrawn');
    await db.delete(entries).where(eq(entries.id, entryId));
    publish(competition.eventId, competition.id);
    return reply.code(204).send();
  });

  // --- Draw ---

  app.post('/api/competitions/:competitionId/draw', { preHandler: requireAdmin }, async (request) => {
    const body = parse(drawBody, request.body ?? {});
    return drawCompetition(ctx(request), idParam(request.params, 'competitionId'), body);
  });

  app.delete('/api/competitions/:competitionId/draw', { preHandler: requireAdmin }, async (request, reply) => {
    await undoDraw(ctx(request), idParam(request.params, 'competitionId'));
    return reply.code(204).send();
  });

  // --- Doubles pairs ---

  app.post('/api/competitions/:competitionId/pairs/draw', { preHandler: requireAdmin }, async (request) => {
    const body = parse(pairDrawBody, request.body ?? {});
    return drawDoublesPairs(ctx(request), idParam(request.params, 'competitionId'), body);
  });

  app.post('/api/competitions/:competitionId/pairs/split', { preHandler: requireAdmin }, async (request) => {
    const body = parse(splitPairsBody, request.body ?? {});
    return splitDoublesPairs(ctx(request), idParam(request.params, 'competitionId'), body.entryIds);
  });

  // --- Match commands (admin; results also from devices signed in with the event PIN) ---

  app.post('/api/matches/:matchId/call', { preHandler: requireAdmin }, async (request) => {
    const body = parse(callBody, request.body);
    return { match: await callMatch(ctx(request), idParam(request.params, 'matchId'), body) };
  });

  app.post('/api/matches/:matchId/uncall', { preHandler: requireAdmin }, async (request) => {
    const body = parse(versionBody, request.body);
    return { match: await uncallMatch(ctx(request), idParam(request.params, 'matchId'), body) };
  });

  app.post('/api/matches/:matchId/result', async (request) => {
    const body = parse(resultBody, request.body);
    const matchId = idParam(request.params, 'matchId');
    // The desk records and corrects results; the registration desk only like a phone at a table (with the PIN)
    if (isAdmin(request)) return { match: await recordResult(ctx(request), matchId, body) };
    const device = await deviceOf(request, db, await eventOfMatch(db, matchId));
    if (!device) throw new ApiError(401, 'notLoggedIn');
    const deviceCtx = { db, broadcaster, actor: `device:${device.id.slice(0, 12)}` };
    return { match: await recordResult(deviceCtx, matchId, { ...body, byDevice: true }) };
  });
}
