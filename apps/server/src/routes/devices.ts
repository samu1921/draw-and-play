import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createDeviceSession, DEVICE_COOKIE, findDevice, generatePin, type DeviceSession } from '../auth/devices.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { auditLog, deviceSessions, events } from '../db/schema.js';
import { ApiError, conflict, parse } from '../errors.js';
import { eventForecast } from '../services/forecast.js';
import { eventOperations } from '../services/operations.js';
import { actorOf, requireAdmin } from './auth.js';
import type { RouteDeps } from './deps.js';
import { findEvent } from './events.js';

const deviceBody = z.object({
  pin: z.string().trim().regex(/^\d{6}$/),
  label: z.string().trim().max(40).optional(),
});

/** The device signed in for this event, if any */
export async function deviceOf(request: FastifyRequest, db: RouteDeps['db'], eventId: string): Promise<DeviceSession | null> {
  const token = request.cookies[DEVICE_COOKIE];
  if (!token) return null;
  const device = await findDevice(db, token);
  return device?.eventId === eventId ? device : null;
}

export async function deviceRoutes(app: FastifyInstance, { db, broadcaster }: RouteDeps) {
  /** New PIN: shown once, signs out every device that used the previous one. */
  app.post('/api/events/:eventId/pin', { preHandler: requireAdmin }, async (request) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    const pin = generatePin();
    await db.transaction(async (tx) => {
      await tx.update(events).set({ pinHash: await hashPassword(pin), pinVersion: event.pinVersion + 1 }).where(eq(events.id, event.id));
      await tx.delete(deviceSessions).where(eq(deviceSessions.eventId, event.id));
      await tx.insert(auditLog).values({ eventId: event.id, actor: actorOf(request), action: 'rotatePin', entityType: 'event', entityId: event.id });
    });
    broadcaster.publish({ eventId: event.id, type: 'event', id: event.id });
    return { pin };
  });

  app.delete('/api/events/:eventId/pin', { preHandler: requireAdmin }, async (request, reply) => {
    const event = await findEvent(db, (request.params as { eventId: string }).eventId);
    await db.transaction(async (tx) => {
      await tx.update(events).set({ pinHash: null, pinVersion: event.pinVersion + 1 }).where(eq(events.id, event.id));
      await tx.delete(deviceSessions).where(eq(deviceSessions.eventId, event.id));
      await tx.insert(auditLog).values({ eventId: event.id, actor: actorOf(request), action: 'disablePin', entityType: 'event', entityId: event.id });
    });
    broadcaster.publish({ eventId: event.id, type: 'event', id: event.id });
    return reply.code(204).send();
  });

  /** A phone at a table enters the PIN once and is remembered as a device session. */
  app.post(
    '/api/events/:eventRef/device',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const event = await findEvent(db, (request.params as { eventRef: string }).eventRef);
      const { pin, label } = parse(deviceBody, request.body);
      if (!event.pinHash) throw conflict('pinDisabled');
      if (!(await verifyPassword(event.pinHash, pin))) throw new ApiError(401, 'invalidPin');
      const { token, expiresAt, device } = await createDeviceSession(db, event.id, event.pinVersion, label ?? null);
      reply.setCookie(DEVICE_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: 'auto', path: '/', expires: expiresAt });
      return { device: { eventId: device.eventId, label: device.label } };
    },
  );

  app.get('/api/events/:eventRef/device', async (request) => {
    const event = await findEvent(db, (request.params as { eventRef: string }).eventRef);
    const device = await deviceOf(request, db, event.id);
    return { device: device ? { eventId: device.eventId, label: device.label } : null };
  });

  /** Tables, queue and recent results for the match desk, phones and the projector */
  app.get('/api/events/:eventRef/operations', async (request) => {
    const event = await findEvent(db, (request.params as { eventRef: string }).eventRef);
    return eventOperations(db, event.id, event.settings, request.user ? 'admin' : 'public');
  });

  /** Live forecast of a tournament day (default: today, or the next day with competitions) */
  app.get('/api/events/:eventRef/forecast', async (request) => {
    const event = await findEvent(db, (request.params as { eventRef: string }).eventRef);
    const { day } = parse(z.object({ day: z.iso.date().optional() }), request.query);
    return eventForecast(db, event, day);
  });
}
