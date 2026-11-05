import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { auditLog, events } from '../db/schema.js';
import { exportEvent, importEvent, parseEventExport } from '../services/eventTransfer.js';
import { actorOf, requireAdmin } from './auth.js';
import type { RouteDeps } from './deps.js';
import { eventView, findEvent } from './events.js';

/** Large events with every match result fit easily; the default limit of 1 MB might not. */
// Room for the event's images (base64) on top of the data
const IMPORT_BODY_LIMIT = 48 * 1024 * 1024;

export async function transferRoutes(app: FastifyInstance, { db }: RouteDeps) {
  /** The whole event as a JSON file (without PIN, devices, users and audit log) */
  app.get('/api/events/:eventId/export', { preHandler: requireAdmin }, async (request, reply) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const doc = await exportEvent(db, event.id);
    const day = doc.exportedAt.slice(0, 10);
    return reply.header('content-disposition', `attachment; filename="${event.slug}-${day}.json"`).send(doc);
  });

  /** Creates a new event from an export file; a taken slug gets a random suffix */
  app.post('/api/events/import', { preHandler: requireAdmin, bodyLimit: IMPORT_BODY_LIMIT }, async (request, reply) => {
    const doc = parseEventExport(request.body);
    const created = await db.transaction(async (tx) => {
      let slug = doc.event.slug;
      for (;;) {
        const [taken] = await tx.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
        if (!taken) break;
        slug = `${doc.event.slug.slice(0, 50)}-${Math.random().toString(36).slice(2, 6)}`;
      }
      const event = await importEvent(tx, doc, slug);
      await tx.insert(auditLog).values({
        eventId: event.id,
        actor: actorOf(request),
        action: 'import',
        entityType: 'event',
        entityId: event.id,
        data: { from: doc.event.slug, exportedAt: doc.exportedAt, domainVersion: doc.domainVersion },
      });
      return event;
    });
    return reply.code(201).send({ event: eventView(created) });
  });
}
