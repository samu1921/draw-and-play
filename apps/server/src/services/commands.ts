import { randomBytes } from 'node:crypto';
import {
  buildStructure,
  createRng,
  dependentMatches,
  drawForStructure,
  tableTennis,
  validateFormat,
  type MatchResult,
  type Side,
} from '@draw-and-play/domain';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { auditLog, competitions, eventTables, matches } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../errors.js';
import type { Broadcaster } from '../realtime/broadcaster.js';
import { loadCompetition, loadCompetitionState, loadEntries, personsOfEntries, toDrawEntry } from './competitions.js';

export interface CommandContext {
  db: Db;
  broadcaster: Broadcaster;
  /** "user:<id>" or "device:<id>", recorded in the audit log */
  actor: string;
}

/** Serialises all commands of one event, so checks like "table free" and "player busy" cannot race. */
async function withEventLock<T>(db: Db, eventId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${eventId}))`);
    return fn(tx);
  });
}

async function audit(tx: Tx, ctx: CommandContext, eventId: string, action: string, entityType: string, entityId: string, data?: unknown) {
  await tx.insert(auditLog).values({ eventId, actor: ctx.actor, action, entityType, entityId, data: data ?? null });
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'cause' in error
    ? (error.cause as { code?: string })?.code === '23505'
    : (error as { code?: string })?.code === '23505';

// --- Draw ---

export async function drawCompetition(ctx: CommandContext, competitionId: string, input: { seed?: string | undefined; snakePots?: number | undefined }) {
  const { eventId } = await loadCompetition(ctx.db, competitionId);
  const result = await withEventLock(ctx.db, eventId, async (tx) => {
    const competition = await loadCompetition(tx, competitionId);
    if (competition.draw) throw conflict('alreadyDrawn');
    const drawEntries = (await loadEntries(tx, competitionId)).filter((e) => e.status !== 'withdrawn');
    const formatError = validateFormat(competition.format, drawEntries.length);
    if (formatError) throw badRequest('invalidFormat', { reason: formatError, entries: drawEntries.length });

    const structure = buildStructure(competition.format, drawEntries.length);
    const seed = input.seed ?? randomBytes(8).toString('hex');
    const draw = drawForStructure(structure, drawEntries.map(toDrawEntry), createRng(seed), {
      ...(input.snakePots !== undefined && { snakePots: input.snakePots }),
    });
    await tx
      .update(competitions)
      .set({ draw, drawSeed: seed, version: competition.version + 1 })
      .where(eq(competitions.id, competitionId));
    await tx.insert(matches).values(structure.matches.map((m) => ({ competitionId, matchKey: m.id })));
    await audit(tx, ctx, eventId, 'draw', 'competition', competitionId, { seed, draw });
    return { draw, seed };
  });
  ctx.broadcaster.publish({ eventId, type: 'competition', id: competitionId });
  return result;
}

/** Undoes the draw while no match has been called or played. */
export async function undoDraw(ctx: CommandContext, competitionId: string) {
  const { eventId } = await loadCompetition(ctx.db, competitionId);
  await withEventLock(ctx.db, eventId, async (tx) => {
    const competition = await loadCompetition(tx, competitionId);
    if (!competition.draw) throw conflict('notDrawn');
    const [started] = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.competitionId, competitionId), ne(matches.status, 'scheduled')))
      .limit(1);
    if (started) throw conflict('matchesStarted');
    await tx.delete(matches).where(eq(matches.competitionId, competitionId));
    await tx
      .update(competitions)
      .set({ draw: null, drawSeed: null, version: competition.version + 1 })
      .where(eq(competitions.id, competitionId));
    await audit(tx, ctx, eventId, 'undoDraw', 'competition', competitionId);
  });
  ctx.broadcaster.publish({ eventId, type: 'competition', id: competitionId });
}

// --- Matches ---

async function eventOfMatch(db: Db, matchId: string): Promise<string> {
  const [row] = await db
    .select({ eventId: competitions.eventId })
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) throw notFound('match');
  return row.eventId;
}

async function matchContext(tx: Tx, matchId: string, version: number) {
  const [row] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!row) throw notFound('match');
  if (row.version !== version) throw conflict('versionConflict', { current: row.version });
  const loaded = await loadCompetitionState(tx, row.competitionId);
  const resolved = loaded.state?.matches.find((m) => m.id === row.matchKey);
  if (!resolved) throw notFound('match');
  return { row, loaded, resolved };
}

/** Persons of the entries playing in currently called matches of the event */
async function busyPersons(tx: Tx, eventId: string, exceptMatchId: string): Promise<Set<string>> {
  const called = await tx
    .select({ sideA: matches.sideA, sideB: matches.sideB })
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .where(and(eq(competitions.eventId, eventId), eq(matches.status, 'called'), ne(matches.id, exceptMatchId)));
  const entryIds = called.flatMap((m) => [m.sideA, m.sideB]).filter((id): id is string => id !== null);
  return new Set([...(await personsOfEntries(tx, entryIds)).values()].flat());
}

export async function callMatch(ctx: CommandContext, matchId: string, input: { tableId: string; version: number }) {
  const eventId = await eventOfMatch(ctx.db, matchId);
  const updated = await withEventLock(ctx.db, eventId, async (tx) => {
    const { row, loaded, resolved } = await matchContext(tx, matchId, input.version);
    if (resolved.status === 'finished') throw conflict('matchFinished');
    if (row.status === 'called') throw conflict('alreadyCalled');
    if (resolved.status !== 'ready') throw conflict('matchNotReady');

    const [table] = await tx
      .select()
      .from(eventTables)
      .where(and(eq(eventTables.id, input.tableId), eq(eventTables.eventId, eventId)))
      .limit(1);
    if (!table) throw badRequest('unknownTable');
    const allowed = loaded.competition.tableIds;
    if (allowed && !allowed.includes(table.id)) throw conflict('tableNotAllowed');
    const [occupied] = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.tableId, table.id), eq(matches.status, 'called')))
      .limit(1);
    if (occupied) throw conflict('tableBusy', { matchId: occupied.id });

    const [sideA, sideB] = resolved.sides as [string, string];
    const own = await personsOfEntries(tx, [sideA, sideB]);
    const busy = await busyPersons(tx, eventId, matchId);
    const clashing = [...own.values()].flat().filter((p) => busy.has(p));
    if (clashing.length > 0) throw conflict('playerBusy', { personIds: clashing });

    try {
      const [result] = await tx
        .update(matches)
        .set({ status: 'called', tableId: table.id, calledAt: new Date(), sideA, sideB, version: row.version + 1, updatedAt: new Date() })
        .where(and(eq(matches.id, matchId), eq(matches.version, row.version)))
        .returning();
      if (!result) throw conflict('versionConflict');
      await audit(tx, ctx, eventId, 'call', 'match', matchId, { tableId: table.id });
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('tableBusy');
      throw error;
    }
  });
  ctx.broadcaster.publish({ eventId, type: 'match', id: matchId });
  return updated;
}

export async function uncallMatch(ctx: CommandContext, matchId: string, input: { version: number }) {
  const eventId = await eventOfMatch(ctx.db, matchId);
  const updated = await withEventLock(ctx.db, eventId, async (tx) => {
    const { row } = await matchContext(tx, matchId, input.version);
    if (row.status !== 'called') throw conflict('notCalled');
    const [result] = await tx
      .update(matches)
      .set({ status: 'scheduled', tableId: null, calledAt: null, version: row.version + 1, updatedAt: new Date() })
      .where(eq(matches.id, matchId))
      .returning();
    await audit(tx, ctx, eventId, 'uncall', 'match', matchId, { tableId: row.tableId });
    return result!;
  });
  ctx.broadcaster.publish({ eventId, type: 'match', id: matchId });
  return updated;
}

export interface ResultInput {
  /** Quick notation, e.g. "4 -5 9 7" */
  notation?: string | undefined;
  /** Walkover: the side that wins without playing */
  walkoverWinner?: Side | undefined;
  version: number;
}

export async function recordResult(ctx: CommandContext, matchId: string, input: ResultInput) {
  const eventId = await eventOfMatch(ctx.db, matchId);
  const updated = await withEventLock(ctx.db, eventId, async (tx) => {
    const { row, loaded, resolved } = await matchContext(tx, matchId, input.version);
    if (resolved.status === 'pending') throw conflict('matchNotReady');

    let result: MatchResult;
    if (input.walkoverWinner !== undefined) {
      result = { winner: input.walkoverWinner, games: [], walkover: true };
    } else {
      const parsed = tableTennis.parseResult(input.notation ?? '', loaded.competition.matchRules);
      if (!parsed.ok) throw badRequest('invalidResult', parsed.error);
      if (parsed.outcome.status !== 'finished') throw badRequest('incompleteResult', { games: parsed.outcome.games });
      result = { winner: parsed.outcome.winner, games: parsed.games };
    }

    // A correction must not pull the rug from under matches that already build on this result.
    if (row.status === 'finished') {
      const dependents = dependentMatches(loaded.structure!, row.matchKey);
      if (dependents.length > 0) {
        const [started] = await tx
          .select({ key: matches.matchKey })
          .from(matches)
          .where(
            and(
              eq(matches.competitionId, row.competitionId),
              inArray(matches.matchKey, dependents),
              ne(matches.status, 'scheduled'),
            ),
          )
          .limit(1);
        if (started) throw conflict('dependentMatchStarted', { matchKey: started.key });
      }
    }

    const [sideA, sideB] = resolved.sides as [string, string];
    const [saved] = await tx
      .update(matches)
      .set({ status: 'finished', result, finishedAt: new Date(), tableId: null, sideA, sideB, version: row.version + 1, updatedAt: new Date() })
      .where(eq(matches.id, matchId))
      .returning();
    await audit(tx, ctx, eventId, row.status === 'finished' ? 'correctResult' : 'result', 'match', matchId, {
      result,
      previous: row.result,
    });
    return saved!;
  });
  ctx.broadcaster.publish({ eventId, type: 'match', id: matchId });
  return updated;
}
