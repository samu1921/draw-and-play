import { ApiRequestError } from './api.js';

/**
 * Results that could not be sent yet, e.g. from a phone in a dead spot. They wait on the device and are sent
 * again as soon as the connection is back. Sending twice is harmless: the server accepts a result the match
 * already holds. Nothing here touches the DOM or the network directly, so it can be tested on its own.
 */

export type ResultBody = { notation: string } | { walkoverWinner: 0 | 1 };

export interface PendingResult {
  matchId: string;
  /** Match version the result was entered for */
  version: number;
  body: ResultBody;
  /** Describes the match while it waits, e.g. "Singles · Group A: Max – Anna" */
  label: string;
  /** Epoch milliseconds */
  savedAt: number;
  /** Error code once the server refused the result for good; the user has to dismiss it */
  conflict?: string;
}

/**
 * What a failed attempt means: `retry` = connection or server trouble, try again later; `signIn` = the device
 * (or session) has to sign in again first; `conflict` = the server refused this result.
 */
export type Failure = { kind: 'retry' } | { kind: 'signIn' } | { kind: 'conflict'; code: string };

export function classifyFailure(error: unknown): Failure {
  if (!(error instanceof ApiRequestError)) return { kind: 'retry' };
  if (error.status === 0 || error.status === 429 || error.status >= 500) return { kind: 'retry' };
  if (error.status === 401) return { kind: 'signIn' };
  return { kind: 'conflict', code: error.code };
}

export interface OutboxStorage {
  load(): PendingResult[];
  save(items: readonly PendingResult[]): void;
}

/** Keeps the outbox in localStorage; when storage is unavailable (private mode), it only lives in memory. */
export function localOutboxStorage(key: string): OutboxStorage {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as PendingResult[]).filter(isPendingResult) : [];
      } catch {
        return [];
      }
    },
    save(items) {
      try {
        if (items.length === 0) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(items));
      } catch {
        // Storage full or blocked: the items stay in memory for this page.
      }
    },
  };
}

function isPendingResult(value: unknown): value is PendingResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PendingResult>;
  return typeof v.matchId === 'string' && typeof v.version === 'number' && typeof v.body === 'object' && v.body !== null && typeof v.label === 'string';
}

export type SendResult = (item: PendingResult) => Promise<void>;

export interface FlushReport {
  sent: PendingResult[];
  refused: PendingResult[];
  needsSignIn: boolean;
}

export class Outbox {
  private list: PendingResult[];
  private flushing: Promise<FlushReport> | null = null;

  constructor(
    private readonly storage: OutboxStorage,
    private readonly send: SendResult,
    private readonly onChange: (items: readonly PendingResult[]) => void = () => {},
  ) {
    this.list = storage.load();
  }

  get items(): readonly PendingResult[] {
    return this.list;
  }

  /** Items still waiting to be sent (not refused) */
  get waiting(): readonly PendingResult[] {
    return this.list.filter((i) => i.conflict === undefined);
  }

  /** Adds an item; a newer result for the same match replaces the older one. */
  add(item: PendingResult) {
    this.update([...this.list.filter((i) => i.matchId !== item.matchId), item]);
  }

  remove(matchId: string) {
    this.update(this.list.filter((i) => i.matchId !== matchId));
  }

  /**
   * Sends the waiting items one after another. Stops at the first connection problem (the rest would fail
   * too) and when a sign-in is needed. Calls that overlap share one run.
   */
  flush(): Promise<FlushReport> {
    this.flushing ??= this.run().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async run(): Promise<FlushReport> {
    const report: FlushReport = { sent: [], refused: [], needsSignIn: false };
    for (const item of this.waiting) {
      try {
        await this.send(item);
        this.remove(item.matchId);
        report.sent.push(item);
      } catch (error) {
        const failure = classifyFailure(error);
        if (failure.kind === 'retry') break;
        if (failure.kind === 'signIn') {
          report.needsSignIn = true;
          break;
        }
        const refused = { ...item, conflict: failure.code };
        this.update(this.list.map((i) => (i.matchId === item.matchId ? refused : i)));
        report.refused.push(refused);
      }
    }
    return report;
  }

  private update(items: PendingResult[]) {
    this.list = items;
    this.storage.save(items);
    this.onChange(items);
  }
}
