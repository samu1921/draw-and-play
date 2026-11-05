import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions, users, type UserRole } from '../db/schema.js';

export const SESSION_COOKIE = 'dap_session';

const digest = (token: string) => createHash('sha256').update(token).digest('base64url');

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
}

/** Creates a session and returns the token for the cookie. Only its hash is stored. */
export async function createSession(db: Db, userId: string, ttlHours: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.insert(sessions).values({ id: digest(token), userId, expiresAt });
  // Housekeeping: drop expired sessions now and then.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function findSessionUser(db: Db, token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, digest(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, digest(token)));
}

/** Signs a user out everywhere, except (optionally) the session making the change */
export async function deleteUserSessions(db: Db, userId: string, exceptToken?: string): Promise<void> {
  const keep = exceptToken ? digest(exceptToken) : null;
  await db.delete(sessions).where(keep ? and(eq(sessions.userId, userId), ne(sessions.id, keep)) : eq(sessions.userId, userId));
}
