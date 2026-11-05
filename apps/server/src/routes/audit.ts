import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditLog, deviceSessions, users } from '../db/schema.js';
import { parse } from '../errors.js';
import { requireAdmin } from './auth.js';
import type { RouteDeps } from './deps.js';
import { findEvent } from './events.js';

const query = z.object({
  /** Entries older than this id (paging backwards) */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * The event's audit log, newest first. Actors are resolved for display: users by name, devices by their label
 * (as long as the device session still exists).
 */
export async function auditRoutes(app: FastifyInstance, { db }: RouteDeps) {
  app.get('/api/events/:eventId/audit', { preHandler: requireAdmin }, async (request) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const { before, limit } = parse(query, request.query);
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.eventId, event.id), before ? lt(auditLog.id, before) : undefined))
      .orderBy(desc(auditLog.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);

    const userIds = [...new Set(page.flatMap((r) => (r.actor.startsWith('user:') ? [r.actor.slice(5)] : [])))];
    const [userRows, deviceRows] = await Promise.all([
      userIds.length > 0 ? db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds)) : [],
      db.select({ id: deviceSessions.id, label: deviceSessions.label }).from(deviceSessions).where(eq(deviceSessions.eventId, event.id)),
    ]);
    const userName = new Map(userRows.map((u) => [u.id, u.username]));
    const actorOf = (actor: string) => {
      if (actor.startsWith('user:')) return { type: 'user' as const, name: userName.get(actor.slice(5)) ?? null };
      if (actor.startsWith('device:')) {
        const prefix = actor.slice(7);
        return { type: 'device' as const, name: deviceRows.find((d) => d.id.startsWith(prefix))?.label ?? null };
      }
      return { type: 'other' as const, name: actor };
    };

    return {
      entries: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        actor: actorOf(r.actor),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        data: r.data,
      })),
      next: rows.length > limit ? page.at(-1)!.id : null,
    };
  });
}
