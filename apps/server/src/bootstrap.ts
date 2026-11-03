import { eq } from 'drizzle-orm';
import { hashPassword } from './auth/password.js';
import type { Db } from './db/client.js';
import { users } from './db/schema.js';

/**
 * Creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD if that user does not exist yet.
 * An existing user is never changed, so the variables can stay set.
 */
export async function ensureAdmin(db: Db, username: string | undefined, password: string | undefined): Promise<'created' | 'exists' | 'skipped'> {
  if (!username || !password) return 'skipped';
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing) return 'exists';
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
  await db.insert(users).values({ username, passwordHash: await hashPassword(password) });
  return 'created';
}
