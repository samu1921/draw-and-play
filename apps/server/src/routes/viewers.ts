import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createViewerSession, generateViewerCode, hasViewerSession, normalizeViewerCode, VIEWER_COOKIE } from '../auth/viewers.js';
import type { Db } from '../db/client.js';
import { auditLog, events, viewerSessions } from '../db/schema.js';
import { ApiError, parse } from '../errors.js';
import { actorOf, requireAdmin } from './auth.js';
import type { RouteDeps } from './deps.js';
import { deviceOf } from './devices.js';
import { findEvent } from './events.js';

type EventRow = typeof events.$inferSelect;

/**
 * Read access to the public views of an event. Open events are readable by everybody; with a viewer code,
 * admins, result-entry devices (PIN) and browsers that entered the code may read. The error tells the client
 * which form to show: the event name, and whether result entry by PIN is on (the table page signs in with it).
 */
export async function requireViewer(request: FastifyRequest, db: Db, event: EventRow): Promise<void> {
  if (event.viewerCode === null || request.user) return;
  if (await hasViewerSession(db, event.id, request.cookies[VIEWER_COOKIE])) return;
  if (await deviceOf(request, db, event.id)) return;
  // The legal links stay reachable on the locked page; the client adds the installation's defaults
  throw new ApiError(401, 'viewerCodeRequired', {
    name: event.name,
    pinEnabled: event.pinHash !== null,
    imprintUrl: event.settings.imprintUrl ?? null,
    privacyUrl: event.settings.privacyUrl ?? null,
  });
}

/** Viewer cookie: tokens are checked on the server, so it may outlive any single session */
const COOKIE_DAYS = 30;

const codeBody = z.object({ code: z.string().trim().min(1).max(20) });

export async function viewerRoutes(app: FastifyInstance, { db, broadcaster }: RouteDeps) {
  async function setCode(request: FastifyRequest, eventId: string, code: string | null) {
    const event = await findEvent(db, eventId);
    await db.transaction(async (tx) => {
      await tx.update(events).set({ viewerCode: code, viewerCodeVersion: event.viewerCodeVersion + 1 }).where(eq(events.id, event.id));
      await tx.delete(viewerSessions).where(eq(viewerSessions.eventId, event.id));
      await tx.insert(auditLog).values({
        eventId: event.id,
        actor: actorOf(request),
        action: code ? 'rotateViewerCode' : 'openPublicViews',
        entityType: 'event',
        entityId: event.id,
      });
    });
    broadcaster.publish({ eventId: event.id, type: 'event', id: event.id });
  }

  /** New viewer code: every browser that used the old one has to enter the new one */
  app.post('/api/events/:eventId/viewer-code', { preHandler: requireAdmin }, async (request) => {
    const code = generateViewerCode();
    await setCode(request, (request.params as { eventId: string }).eventId, code);
    return { code };
  });

  /** Opens the public views to everybody */
  app.delete('/api/events/:eventId/viewer-code', { preHandler: requireAdmin }, async (request, reply) => {
    await setCode(request, (request.params as { eventId: string }).eventId, null);
    return reply.code(204).send();
  });

  /** A browser enters the viewer code once and is remembered until the day after the event */
  app.post(
    '/api/events/:eventRef/viewer',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const event = await findEvent(db, (request.params as { eventRef: string }).eventRef);
      const { code } = parse(codeBody, request.body);
      if (event.viewerCode === null) return { ok: true };
      if (normalizeViewerCode(code) !== event.viewerCode) throw new ApiError(401, 'invalidViewerCode');
      const session = await createViewerSession(db, event, request.cookies[VIEWER_COOKIE]);
      reply.setCookie(VIEWER_COOKIE, session.cookie, { httpOnly: true, sameSite: 'lax', secure: 'auto', path: '/', maxAge: COOKIE_DAYS * 24 * 3600 });
      return { ok: true };
    },
  );
}
