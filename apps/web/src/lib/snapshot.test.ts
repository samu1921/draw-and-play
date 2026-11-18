import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSnapshots, loadRemembered, readSnapshot, writeSnapshot } from './snapshot.js';

/** A minimal localStorage, since the tests run in Node */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
  };
}

const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('snapshots', () => {
  it('keeps public and staff data apart, and clears one scope only', () => {
    writeSnapshot('public', 'overview:x', { a: 1 });
    writeSnapshot('staff', 'overview:x', { a: 2 });
    expect(readSnapshot('public', 'overview:x')).toEqual({ a: 1 });
    clearSnapshots('staff');
    expect(readSnapshot('staff', 'overview:x')).toBeNull();
    expect(readSnapshot('public', 'overview:x')).toEqual({ a: 1 });
  });

  it('returns the kept answer when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', () => answer(200, { n: 1 }));
    expect(await loadRemembered('staff', 'state:c', '/api/x')).toEqual({ value: { n: 1 }, stale: false });
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await loadRemembered('staff', 'state:c', '/api/x')).toEqual({ value: { n: 1 }, stale: true });
  });

  it('throws without a kept answer, and never falls back after a refusal', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(loadRemembered('staff', 'state:c', '/api/x')).rejects.toMatchObject({ status: 0 });
    writeSnapshot('staff', 'state:c', { n: 1 });
    vi.stubGlobal('fetch', () => answer(403, { error: 'forbidden' }));
    await expect(loadRemembered('staff', 'state:c', '/api/x')).rejects.toMatchObject({ status: 403 });
  });
});
