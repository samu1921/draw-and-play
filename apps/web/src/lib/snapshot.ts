/**
 * The last answers of the server, kept on the device, so a page opened or reloaded without a connection still
 * shows the last known state. Public data (the table page) and data for signed-in staff (desk, competitions) are
 * kept apart, so signing out removes exactly the staff data.
 * Storage may be missing or full (private mode): then there is simply no snapshot.
 */

import { api, ApiRequestError } from './api.js';

export type SnapshotScope = 'public' | 'staff';

const PREFIX: Record<SnapshotScope, string> = { public: 'dap-snapshot:', staff: 'dap-staff:' };

export function readSnapshot<T>(scope: SnapshotScope, key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX[scope] + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(scope: SnapshotScope, key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX[scope] + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the page just has no snapshot after a reload
  }
}

/** Removes every snapshot of a scope, e.g. the staff data when signing out */
export function clearSnapshots(scope: SnapshotScope) {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith(PREFIX[scope]));
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Nothing stored
  }
}

/**
 * Loads `path` and keeps the answer; without a connection the kept answer is returned instead, marked as `stale`.
 * Refusals are thrown as usual, so data this browser may no longer read never comes back from storage.
 */
export async function loadRemembered<T>(scope: SnapshotScope, key: string, path: string): Promise<{ value: T; stale: boolean }> {
  try {
    const value = await api<T>('GET', path);
    writeSnapshot(scope, key, value);
    return { value, stale: false };
  } catch (e) {
    const kept = e instanceof ApiRequestError && e.status === 0 ? readSnapshot<T>(scope, key) : null;
    if (kept === null) throw e;
    return { value: kept, stale: true };
  }
}
