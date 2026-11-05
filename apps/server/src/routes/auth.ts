import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, deleteSession, deleteUserSessions, findSessionUser, SESSION_COOKIE, type SessionUser } from '../auth/sessions.js';
import { users } from '../db/schema.js';
import { ApiError, parse } from '../errors.js';
import type { RouteDeps } from './deps.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

/** Passwords of all accounts: at least 12 characters, like the first admin's */
export const newPassword = z.string().min(12).max(500);
const passwordBody = z.object({ current: z.string().min(1).max(500), next: newPassword });

const loginBody = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(500),
});

export async function authRoutes(app: FastifyInstance, { db, sessionTtlHours }: RouteDeps) {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.user = token ? await findSessionUser(db, token) : null;
  });

  app.post(
    '/api/auth/login',
    // Brute-force protection: a handful of attempts per client and quarter hour.
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { username, password } = parse(loginBody, request.body);
      const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      const valid = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), password);
      if (!user || !valid) throw new ApiError(401, 'invalidCredentials');

      const { token, expiresAt } = await createSession(db, user.id, sessionTtlHours);
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
        path: '/',
        expires: expiresAt,
      });
      return { user: { id: user.id, username: user.username, role: user.role } };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  /** Changes the own password; every other session of the user is signed out */
  app.post('/api/auth/password', { preHandler: requireStaff, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const { current, next } = parse(passwordBody, request.body);
    const [user] = await db.select().from(users).where(eq(users.id, request.user!.id)).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, current))) throw new ApiError(401, 'invalidCredentials');
    await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
    await deleteUserSessions(db, user.id, request.cookies[SESSION_COOKIE]);
    return reply.code(204).send();
  });

  /** `{ user: null }` when signed out: not an error, every page asks this once. */
  app.get('/api/auth/me', async (request) => ({ user: request.user }));
}

/** preHandler for routes of the tournament management (role admin) */
export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new ApiError(401, 'notLoggedIn');
  if (request.user.role !== 'admin') throw new ApiError(403, 'adminOnly');
}

/** preHandler for routes the registration desk may use as well: players, entries, attendance */
export async function requireStaff(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new ApiError(401, 'notLoggedIn');
}

export const isAdmin = (request: FastifyRequest) => request.user?.role === 'admin';

export const actorOf = (request: FastifyRequest) => `user:${request.user!.id}`;
