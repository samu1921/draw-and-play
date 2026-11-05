import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api.js';
import { classifyFailure, Outbox, type OutboxStorage, type PendingResult } from './outbox.js';

const item = (matchId: string, notation = '4 5 6'): PendingResult => ({ matchId, version: 1, body: { notation }, label: matchId, savedAt: 0 });

function memoryStorage(initial: PendingResult[] = []): OutboxStorage & { saved: PendingResult[] } {
  const storage = {
    saved: initial,
    load: () => storage.saved,
    save: (items: readonly PendingResult[]) => void (storage.saved = [...items]),
  };
  return storage;
}

describe('classifyFailure', () => {
  it('retries connection and server trouble, asks for sign-in on 401 and gives up on refusals', () => {
    expect(classifyFailure(new ApiRequestError(0, 'offline'))).toEqual({ kind: 'retry' });
    expect(classifyFailure(new ApiRequestError(502, 'internal'))).toEqual({ kind: 'retry' });
    expect(classifyFailure(new ApiRequestError(429, 'tooManyRequests'))).toEqual({ kind: 'retry' });
    expect(classifyFailure(new TypeError('fetch failed'))).toEqual({ kind: 'retry' });
    expect(classifyFailure(new ApiRequestError(401, 'notLoggedIn'))).toEqual({ kind: 'signIn' });
    expect(classifyFailure(new ApiRequestError(409, 'versionConflict'))).toEqual({ kind: 'conflict', code: 'versionConflict' });
    expect(classifyFailure(new ApiRequestError(403, 'correctionsAdminOnly'))).toEqual({ kind: 'conflict', code: 'correctionsAdminOnly' });
  });
});

describe('Outbox', () => {
  it('keeps items in storage and replaces an older result for the same match', () => {
    const storage = memoryStorage();
    const outbox = new Outbox(storage, async () => {});
    outbox.add(item('a', '1 2 3'));
    outbox.add(item('b'));
    outbox.add(item('a', '4 5 6'));
    expect(storage.saved.map((i) => [i.matchId, i.body])).toEqual([
      ['b', { notation: '4 5 6' }],
      ['a', { notation: '4 5 6' }],
    ]);
    expect(new Outbox(storage, async () => {}).items).toHaveLength(2);
  });

  it('sends everything once the connection is back', async () => {
    const send = vi.fn(async () => {});
    const changes: number[] = [];
    const outbox = new Outbox(memoryStorage([item('a'), item('b')]), send, (items) => changes.push(items.length));
    const report = await outbox.flush();
    expect(report.sent.map((i) => i.matchId)).toEqual(['a', 'b']);
    expect(outbox.items).toEqual([]);
    expect(changes).toEqual([1, 0]);
  });

  it('stops at the first connection problem and keeps the rest', async () => {
    const send = vi.fn(async (i: PendingResult) => {
      if (i.matchId === 'b') throw new ApiRequestError(0, 'offline');
    });
    const outbox = new Outbox(memoryStorage([item('a'), item('b'), item('c')]), send);
    const report = await outbox.flush();
    expect(report.sent.map((i) => i.matchId)).toEqual(['a']);
    expect(outbox.items.map((i) => i.matchId)).toEqual(['b', 'c']);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('marks refused results and does not send them again', async () => {
    const send = vi.fn(async (i: PendingResult) => {
      if (i.matchId === 'a') throw new ApiRequestError(409, 'versionConflict');
    });
    const outbox = new Outbox(memoryStorage([item('a'), item('b')]), send);
    const report = await outbox.flush();
    expect(report.refused.map((i) => [i.matchId, i.conflict])).toEqual([['a', 'versionConflict']]);
    expect(outbox.items).toEqual([{ ...item('a'), conflict: 'versionConflict' }]);
    expect(outbox.waiting).toEqual([]);

    send.mockClear();
    await outbox.flush();
    expect(send).not.toHaveBeenCalled();
    outbox.remove('a');
    expect(outbox.items).toEqual([]);
  });

  it('waits for a new sign-in when the device was signed out', async () => {
    let signedIn = false;
    const send = vi.fn(async () => {
      if (!signedIn) throw new ApiRequestError(401, 'notLoggedIn');
    });
    const outbox = new Outbox(memoryStorage([item('a')]), send);
    expect((await outbox.flush()).needsSignIn).toBe(true);
    expect(outbox.waiting).toHaveLength(1);
    signedIn = true;
    expect((await outbox.flush()).sent).toHaveLength(1);
  });

  it('shares one run between overlapping flushes', async () => {
    let release!: () => void;
    const send = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const outbox = new Outbox(memoryStorage([item('a')]), send);
    const first = outbox.flush();
    const second = outbox.flush();
    expect(second).toBe(first);
    release();
    await first;
    expect(send).toHaveBeenCalledTimes(1);
  });
});
