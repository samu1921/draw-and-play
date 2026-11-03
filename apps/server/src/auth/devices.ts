import { createHash, randomBytes, randomInt } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { deviceSessions, events } from '../db/schema.js';

export const DEVICE_COOKIE = 'dap_device';
/** Devices stay signed in for a tournament weekend unless the PIN is rotated */
export const DEVICE_TTL_HOURS = 72;

const digest = (token: string) => createHash('sha256').update(token).digest('base64url');

/** Six digits, easy to type on a phone and to rotate every day */
export const generatePin = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export interface DeviceSession {
  id: string;
  eventId: string;
  label: string | null;
}

export async function createDeviceSession(db: Db, eventId: string, pinVersion: number, label: string | null) {
  const token = randomBytes(32).toString('base64url');
  const id = digest(token);
  const expiresAt = new Date(Date.now() + DEVICE_TTL_HOURS * 3600_000);
  await db.insert(deviceSessions).values({ id, eventId, pinVersion, label, expiresAt });
  await db.delete(deviceSessions).where(lt(deviceSessions.expiresAt, new Date()));
  return { token, expiresAt, device: { id, eventId, label } };
}

/** The device behind a token, only while it is not expired and the PIN has not been rotated since. */
export async function findDevice(db: Db, token: string): Promise<DeviceSession | null> {
  const [row] = await db
    .select({ id: deviceSessions.id, eventId: deviceSessions.eventId, label: deviceSessions.label })
    .from(deviceSessions)
    .innerJoin(events, eq(events.id, deviceSessions.eventId))
    .where(
      and(
        eq(deviceSessions.id, digest(token)),
        gt(deviceSessions.expiresAt, new Date()),
        eq(deviceSessions.pinVersion, events.pinVersion),
      ),
    )
    .limit(1);
  return row ?? null;
}
