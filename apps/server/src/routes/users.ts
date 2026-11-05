import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { deleteUserSessions } from '../auth/sessions.js';
import type { Db, Tx } from '../db/client.js';
import { users } from '../db/schema.js';
import { ApiError, conflict, notFound, parse } from '../errors.js';
import { newPassword, requireAdmin } from './auth.js';
import type { RouteDeps } from './deps.js';

const role = z.enum(['admin', 'desk']);
const createBody = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[\p{L}\p{N}._@-]+$/u),
  password: newPassword,
  role: role.default('admin'),
});
const updateBody = z.object({ role: role.optional(), password: newPassword.optional() });

const userView = (u: typeof users.$inferSelect) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt });

/** There is always at least one admin, or nobody could manage the tournament any more. */
async function ensureAnotherAdmin(ex: Db | Tx, leavingId: string) {
  const admins = await ex.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
  if (!admins.some((a) => a.id !== leavingId)) throw conflict('lastAdmin');
}

export async function userRoutes(app: FastifyInstance, { db }: RouteDeps) {
  app.get('/api/users', { preHandler: requireAdmin }, async () => ({
    users: (await db.select().from(users).orderBy(asc(users.username))).map(userView),
  }));

  app.post('/api/users', { preHandler: requireAdmin }, async (request, reply) => {
    const body = parse(createBody, request.body);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1);
    if (taken) throw conflict('usernameTaken');
    const [user] = await db.insert(users).values({ username: body.username, passwordHash: await hashPassword(body.password), role: body.role }).returning();
    return reply.code(201).send({ user: userView(user!) });
  });

  /** New role or new password; either signs the user out, so the change applies right away */
  app.patch('/api/users/:userId', { preHandler: requireAdmin }, async (request) => {
    const userId = parse(z.uuid(), (request.params as { userId: string }).userId);
    const body = parse(updateBody, request.body);
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!current) throw notFound('user');
      if (body.role && body.role !== 'admin' && current.role === 'admin') await ensureAnotherAdmin(tx, userId);
      const [row] = await tx
        .update(users)
        .set({ ...(body.role && { role: body.role }), ...(body.password && { passwordHash: await hashPassword(body.password) }) })
        .where(eq(users.id, userId))
        .returning();
      return row!;
    });
    // Your own sessions stay when you only change your role or reset your own password here
    if (userId !== request.user!.id) await deleteUserSessions(db, userId);
    return { user: userView(updated) };
  });

  app.delete('/api/users/:userId', { preHandler: requireAdmin }, async (request, reply) => {
    const userId = parse(z.uuid(), (request.params as { userId: string }).userId);
    if (userId === request.user!.id) throw new ApiError(409, 'cannotDeleteSelf');
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!current) throw notFound('user');
      if (current.role === 'admin') await ensureAnotherAdmin(tx, userId);
      // Sessions go with the user (cascade); display profiles keep existing without their creator
      await tx.delete(users).where(eq(users.id, userId));
    });
    return reply.code(204).send();
  });
}
