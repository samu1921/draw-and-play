import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

export type StreamStatus = 'connecting' | 'live' | 'offline';

/** What changed, as pushed by the server; `draw` and `pairs` follow a draw of competition `id` */
export interface ChangeMessage {
  type: 'event' | 'tables' | 'persons' | 'competition' | 'match' | 'display' | 'draw' | 'pairs';
  id: string;
}

/**
 * Subscribes to the event's change stream (Server-Sent Events) and calls `onChange` once per burst of changes,
 * with the messages of the burst. The browser reconnects automatically; after a reconnect `onChange` runs too
 * (without messages), so nothing missed stays stale.
 */
export function useEventStream(eventRef: Ref<string | undefined>, onChange: (messages: ChangeMessage[]) => void) {
  const status = ref<StreamStatus>('connecting');
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let connectedBefore = false;
  let pending: ChangeMessage[] = [];

  const schedule = (message?: ChangeMessage) => {
    if (message) pending.push(message);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const messages = pending;
      pending = [];
      onChange(messages);
    }, 150);
  };

  const close = () => {
    source?.close();
    source = null;
    clearTimeout(timer);
    pending = [];
  };

  const open = (ref: string) => {
    close();
    connectedBefore = false;
    status.value = 'connecting';
    source = new EventSource(`/api/events/${encodeURIComponent(ref)}/stream`);
    source.addEventListener('ready', () => {
      status.value = 'live';
      if (connectedBefore) schedule();
      connectedBefore = true;
    });
    source.addEventListener('change', (e) => {
      try {
        schedule(JSON.parse((e as MessageEvent<string>).data) as ChangeMessage);
      } catch {
        schedule();
      }
    });
    source.onerror = () => {
      status.value = 'offline';
    };
  };

  watch(eventRef, (value) => (value ? open(value) : close()), { immediate: true });
  onBeforeUnmount(close);
  return { status };
}
