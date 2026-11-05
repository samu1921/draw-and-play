import { randomBytes } from 'node:crypto';
import {
  buildStructure,
  createRng,
  dependentMatches,
  drawForStructure,
  drawPairs,
  validateFormat,
  type CompetitionDrawOptions,
  type MatchResult,
  type MatchRules,
  type PairDrawMode,
  type Side,
  type SportProfile,
} from '@draw-and-play/domain';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { auditLog, competitions, entries, entryMembers, eventTables, matches } from '../db/schema.js';
import { ApiError, badRequest, conflict, notFound } from '../errors.js';
import type { Broadcaster } from '../realtime/broadcaster.js';
import { loadCompetition, loadCompetitionState, loadEntries, personsOfEntries, sportOfEvent, toDrawEntry } from './competitions.js';

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

export interface DrawInput extends CompetitionDrawOptions {
  seed?: string | undefined;
}

export async function drawCompetition(ctx: CommandContext, competitionId: string, input: DrawInput) {
  const { eventId } = await loadCompetition(ctx.db, competitionId);
  const result = await withEventLock(ctx.db, eventId, async (tx) => {
    const competition = await loadCompetition(tx, competitionId);
    if (competition.draw) throw conflict('alreadyDrawn');
    const drawEntries = (await loadEntries(tx, competitionId)).filter((e) => e.status !== 'withdrawn');
    const unpaired = drawEntries.filter((e) => e.members.length < 2).length;
    if (competition.kind === 'doubles' && unpaired > 0) throw badRequest('unpairedPlayers', { count: unpaired });
    const formatError = validateFormat(competition.format, drawEntries.length);
    if (formatError) throw badRequest('invalidFormat', { reason: formatError, entries: drawEntries.length });

    const structure = buildStructure(competition.format, drawEntries.length);
    const seed = input.seed ?? randomBytes(8).toString('hex');
    const options: CompetitionDrawOptions = {
      ...(input.seedCount !== undefined && { seedCount: input.seedCount }),
      ...(input.seedPlacement !== undefined && { seedPlacement: input.seedPlacement }),
    };
    const draw = drawForStructure(structure, drawEntries.map(toDrawEntry), createRng(seed), options);
    await tx
      .update(competitions)
      .set({ draw, drawSeed: seed, version: competition.version + 1 })
      .where(eq(competitions.id, competitionId));
    await tx.insert(matches).values(structure.matches.map((m) => ({ competitionId, matchKey: m.id })));
    await audit(tx, ctx, eventId, 'draw', 'competition', competitionId, { seed, options, draw });
    return { draw, seed };
  });
  ctx.broadcaster.publish({ eventId, type: 'draw', id: competitionId });
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

// --- Withdrawals ---

async function loadEntry(ex: Db | Tx, entryId: string) {
  const [entry] = await ex.select().from(entries).where(eq(entries.id, entryId)).limit(1);
  if (!entry) throw notFound('entry');
  return entry;
}

/**
 * A player (or pair) withdraws after the draw: their remaining matches become walkovers for the opponents,
 * now and in later knockout rounds. Results that are recorded stay. A match on a table has to be taken back first.
 */
export async function withdrawEntry(ctx: CommandContext, entryId: string) {
  const { competitionId } = await loadEntry(ctx.db, entryId);
  const { eventId } = await loadCompetition(ctx.db, competitionId);
  const walkovers = await withEventLock(ctx.db, eventId, async (tx) => {
    const loaded = await loadCompetitionState(tx, competitionId);
    if (!loaded.competition.draw) throw conflict('notDrawn');
    const entry = loaded.entries.find((e) => e.id === entryId)!;
    if (entry.status === 'withdrawn') throw conflict('alreadyWithdrawn');
    const called = loaded.matchRows.find((m) => m.status === 'called' && (m.sideA === entryId || m.sideB === entryId));
    if (called) throw conflict('matchCalled', { matchId: called.id });
    await tx.update(entries).set({ status: 'withdrawn' }).where(eq(entries.id, entryId));
    const after = await loadCompetitionState(tx, competitionId);
    const count = after.state?.matches.filter((m) => m.withdrawal && m.sides.includes(entryId)).length ?? 0;
    await audit(tx, ctx, eventId, 'withdraw', 'entry', entryId, { walkovers: count });
    return count;
  });
  ctx.broadcaster.publish({ eventId, type: 'competition', id: competitionId });
  return { walkovers };
}

/** Takes a withdrawal back, as long as no match that builds on one of its walkovers has started. */
export async function reinstateEntry(ctx: CommandContext, entryId: string) {
  const { competitionId } = await loadEntry(ctx.db, entryId);
  const { eventId } = await loadCompetition(ctx.db, competitionId);
  await withEventLock(ctx.db, eventId, async (tx) => {
    const loaded = await loadCompetitionState(tx, competitionId);
    const entry = loaded.entries.find((e) => e.id === entryId)!;
    if (entry.status !== 'withdrawn') throw conflict('notWithdrawn');
    if (loaded.structure && loaded.state) {
      const started = new Set(loaded.matchRows.filter((m) => m.status !== 'scheduled').map((m) => m.matchKey));
      for (const m of loaded.state.matches.filter((x) => x.withdrawal && x.sides.includes(entryId))) {
        const blocking = dependentMatches(loaded.structure, m.id).find((key) => started.has(key));
        if (blocking) throw conflict('dependentMatchStarted', { matchKey: blocking });
      }
    }
    await tx.update(entries).set({ status: 'present' }).where(eq(entries.id, entryId));
    await audit(tx, ctx, eventId, 'reinstate', 'entry', entryId);
  });
  ctx.broadcaster.publish({ eventId, type: 'competition', id: competitionId });
}

// --- Doubles pairs ---

/** Players registered without a partner in a doubles competition, which is still open for entries */
async function openDoubles(tx: Tx, competitionId: string) {
  const competition = await loadCompetition(tx, competitionId);
  if (competition.kind !== 'doubles') throw badRequest('notDoubles');
  if (competition.draw) throw conflict('alreadyDrawn');
  return loadEntries(tx, competitionId);
}

/**
 * Pairs all players without a partner: in seeded mode the upper half of the seeding list gets a partner drawn
 * from the lower half. The stronger player's entry becomes the pair (keeping its seed), the partner's entry goes.
 */
export async function drawDoublesPairs(ctx: CommandContext, competitionId: string, input: { seed?: string | undefined; mode: PairDrawMode }) {
  const { eventId } = await loadCompetition(ctx.db, competitionId);
  const result = await withEventLock(ctx.db, eventId, async (tx) => {
    const singles = (await openDoubles(tx, competitionId)).filter((e) => e.status !== 'withdrawn' && e.members.length === 1);
    if (singles.length < 2 || singles.length % 2 !== 0) throw badRequest('oddPlayerCount', { count: singles.length });

    const seed = input.seed ?? randomBytes(8).toString('hex');
    const pairs = drawPairs(singles.map(toDrawEntry), input.mode, createRng(seed));
    const byId = new Map(singles.map((e) => [e.id, e]));
    for (const [first, second] of pairs) {
      const partner = byId.get(second)!;
      await tx.delete(entries).where(eq(entries.id, second));
      await tx.insert(entryMembers).values({ entryId: first, personId: partner.members[0]!.id, position: 1 });
      const bothPresent = byId.get(first)!.status === 'present' && partner.status === 'present';
      await tx
        .update(entries)
        .set({ status: bothPresent ? 'present' : 'registered' })
        .where(eq(entries.id, first));
    }
    const pairPersons = pairs.map((pair) => pair.map((id) => byId.get(id)!.members[0]!.id));
    await audit(tx, ctx, eventId, 'drawPairs', 'competition', competitionId, { seed, mode: input.mode, pairs: pairPersons });
    return { seed, pairs: pairs.map(([entryId], i) => ({ entryId, personIds: pairPersons[i]! })) };
  });
  ctx.broadcaster.publish({ eventId, type: 'pairs', id: competitionId });
  return result;
}

/** Splits pairs back into single players (all pairs, or the given entries). The second player gets a new entry. */
export async function splitDoublesPairs(ctx: CommandContext, competitionId: string, entryIds?: string[]) {
  const { eventId } = await loadCompetition(ctx.db, competitionId);
  const split = await withEventLock(ctx.db, eventId, async (tx) => {
    const pairs = (await openDoubles(tx, competitionId)).filter((e) => e.members.length === 2 && (!entryIds || entryIds.includes(e.id)));
    if (entryIds && pairs.length !== new Set(entryIds).size) throw notFound('entry');
    for (const pair of pairs) {
      const partner = pair.members[1]!;
      await tx.delete(entryMembers).where(and(eq(entryMembers.entryId, pair.id), eq(entryMembers.position, 1)));
      const [created] = await tx.insert(entries).values({ competitionId, status: pair.status }).returning();
      await tx.insert(entryMembers).values({ entryId: created!.id, personId: partner.id, position: 0 });
    }
    await audit(tx, ctx, eventId, 'splitPairs', 'competition', competitionId, { entryIds: pairs.map((p) => p.id) });
    return pairs.length;
  });
  ctx.broadcaster.publish({ eventId, type: 'competition', id: competitionId });
  return { split };
}

// --- Matches ---

export async function eventOfMatch(db: Db, matchId: string): Promise<string> {
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
  /** Result entry by a device (PIN): only for called matches, no corrections, no walkovers */
  byDevice?: boolean;
}

/** The result a request asks for; validation errors become 400s */
function requestedResult(input: ResultInput, rules: MatchRules, sport: SportProfile): MatchResult {
  if (input.walkoverWinner !== undefined) return { winner: input.walkoverWinner, games: [], walkover: true };
  const parsed = sport.parseResult(input.notation ?? '', rules);
  if (!parsed.ok) throw badRequest('invalidResult', parsed.error);
  if (parsed.outcome.status !== 'finished') throw badRequest('incompleteResult', { games: parsed.outcome.games });
  return { winner: parsed.outcome.winner, games: parsed.games };
}

function sameResult(a: MatchResult, b: MatchResult): boolean {
  return (
    a.winner === b.winner &&
    Boolean(a.walkover) === Boolean(b.walkover) &&
    a.games.length === b.games.length &&
    a.games.every(([x, y], i) => x === b.games[i]![0] && y === b.games[i]![1])
  );
}

export async function recordResult(ctx: CommandContext, matchId: string, input: ResultInput) {
  const eventId = await eventOfMatch(ctx.db, matchId);
  let unchanged = false;
  const updated = await withEventLock(ctx.db, eventId, async (tx) => {
    // A request that is sent again (e.g. by a phone whose first answer got lost in a dead spot) must not fail:
    // if the match already holds exactly this result, nothing changes, whatever version the request names.
    const [current] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (current?.status === 'finished' && current.result) {
      const competition = await loadCompetition(tx, current.competitionId);
      const sport = await sportOfEvent(tx, competition.eventId);
      if (sameResult(current.result, requestedResult(input, competition.matchRules, sport))) {
        unchanged = true;
        return current;
      }
    }

    const { row, loaded, resolved } = await matchContext(tx, matchId, input.version);
    if (resolved.status === 'pending') throw conflict('matchNotReady');
    if (input.byDevice) {
      if (row.status === 'finished') throw new ApiError(403, 'correctionsAdminOnly');
      if (input.walkoverWinner !== undefined) throw new ApiError(403, 'walkoverAdminOnly');
      if (row.status !== 'called') throw conflict('notCalled');
    }

    const result = requestedResult(input, loaded.competition.matchRules, loaded.sport);

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
  if (!unchanged) ctx.broadcaster.publish({ eventId, type: 'match', id: matchId });
  return updated;
}
