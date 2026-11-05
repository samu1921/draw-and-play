import { createHash, randomBytes, randomInt } from 'node:crypto';
import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { events, viewerSessions } from '../db/schema.js';

/**
 * Viewer access: the public views of an event can be limited to people who know its viewer code. A browser that
 * entered the code keeps a viewer session per event; the tokens of up to MAX_TOKENS events share one cookie.
 */
export const VIEWER_COOKIE = 'dap_viewer';
const MAX_TOKENS = 5;

/** No 0/O, 1/I/L: the code is read off a notice and typed on a phone */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const generateViewerCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join('');

/** Spaces, dashes and case do not matter when the code is typed */
export const normalizeViewerCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const digest = (token: string) => createHash('sha256').update(token).digest('base64url');

/** Until the end of the day after the event (its last day, else its first, else today); at least one more day */
export function viewerExpiry(event: { startsOn: string | null; endsOn: string | null }, now = new Date()): Date {
  const lastDay = event.endsOn ?? event.startsOn;
  const fromEvent = lastDay ? new Date(`${lastDay}T00:00:00Z`).getTime() + 2 * 24 * 3600_000 : 0;
  return new Date(Math.max(fromEvent, now.getTime() + 24 * 3600_000));
}

export function cookieTokens(cookie: string | undefined): string[] {
  return (cookie ?? '').split('.').filter((t) => /^[A-Za-z0-9_-]{20,}$/.test(t));
}

export async function createViewerSession(db: Db, event: { id: string; viewerCodeVersion: number; startsOn: string | null; endsOn: string | null }, cookie: string | undefined) {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = viewerExpiry(event);
  await db.insert(viewerSessions).values({ id: digest(token), eventId: event.id, codeVersion: event.viewerCodeVersion, expiresAt });
  await db.delete(viewerSessions).where(lt(viewerSessions.expiresAt, new Date()));
  // Newest first; the oldest tokens drop out of the cookie
  const tokens = [token, ...cookieTokens(cookie)].slice(0, MAX_TOKENS);
  return { cookie: tokens.join('.'), expiresAt };
}

/** Whether one of the cookie's tokens is a valid viewer session of the event with its current code */
export async function hasViewerSession(db: Db, eventId: string, cookie: string | undefined): Promise<boolean> {
  const ids = cookieTokens(cookie).map(digest);
  if (ids.length === 0) return false;
  const [row] = await db
    .select({ id: viewerSessions.id })
    .from(viewerSessions)
    .innerJoin(events, eq(events.id, viewerSessions.eventId))
    .where(
      and(
        inArray(viewerSessions.id, ids),
        eq(viewerSessions.eventId, eventId),
        gt(viewerSessions.expiresAt, new Date()),
        eq(viewerSessions.codeVersion, events.viewerCodeVersion),
      ),
    )
    .limit(1);
  return row !== undefined;
}
