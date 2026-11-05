import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import { api } from '../lib/api.js';
import { classifyFailure, localOutboxStorage, Outbox, type PendingResult } from '../lib/outbox.js';
import type { StreamStatus } from './useEventStream.js';

/** How often waiting results are sent again while the connection is down */
const RETRY_MS = 15_000;

export type SubmitOutcome = 'sent' | 'queued';
export type ResultOutbox = ReturnType<typeof useResultOutbox>;

/**
 * Result entry that survives dead spots: a result that cannot be sent waits on the device and goes out again
 * when the browser is back online, when the live stream reconnects, and every 15 seconds.
 * `device`: a phone signed in with the PIN; a lost sign-in then keeps the result until the PIN is entered again.
 * For the desk (admin session) a lost sign-in is an ordinary error.
 */
export function useResultOutbox(eventId: Ref<string | undefined>, status: Ref<StreamStatus>, options: { device?: boolean } = {}) {
  const items = shallowRef<readonly PendingResult[]>([]);
  const needsSignIn = ref(false);
  let outbox: Outbox | null = null;

  const send = async (item: PendingResult) => {
    await api('POST', `/api/matches/${item.matchId}/result`, { ...item.body, version: item.version });
  };

  watch(
    eventId,
    (id) => {
      outbox = id ? new Outbox(localOutboxStorage(`dap-outbox:${id}`), send, (list) => (items.value = list)) : null;
      items.value = outbox?.items ?? [];
      void flush();
    },
    { immediate: true },
  );

  async function flush() {
    if (!outbox || outbox.waiting.length === 0) return;
    const report = await outbox.flush();
    needsSignIn.value = report.needsSignIn;
  }

  /** Sends a result now, or keeps it for later when the connection is down. Refusals are thrown as usual. */
  async function submit(entry: Omit<PendingResult, 'savedAt' | 'conflict'>): Promise<SubmitOutcome> {
    const item: PendingResult = { ...entry, savedAt: Date.now() };
    try {
      await send(item);
      outbox?.remove(item.matchId);
      return 'sent';
    } catch (error) {
      const failure = classifyFailure(error);
      const keep = failure.kind === 'retry' || (failure.kind === 'signIn' && options.device);
      if (!keep || !outbox) throw error;
      outbox.add(item);
      if (failure.kind === 'signIn') needsSignIn.value = true;
      return 'queued';
    }
  }

  const onOnline = () => void flush();
  window.addEventListener('online', onOnline);
  const timer = setInterval(() => void flush(), RETRY_MS);
  onBeforeUnmount(() => {
    window.removeEventListener('online', onOnline);
    clearInterval(timer);
  });
  watch(status, (value) => {
    if (value === 'live') void flush();
  });

  return {
    items,
    waiting: computed(() => items.value.filter((i) => i.conflict === undefined)),
    refused: computed(() => items.value.filter((i) => i.conflict !== undefined)),
    needsSignIn,
    submit,
    flush,
    dismiss: (matchId: string) => outbox?.remove(matchId),
  };
}
