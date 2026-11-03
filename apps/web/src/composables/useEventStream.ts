import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

export type StreamStatus = 'connecting' | 'live' | 'offline';

/**
 * Subscribes to the event's change stream (Server-Sent Events) and calls `onChange` once per burst of changes.
 * The browser reconnects automatically; after a reconnect `onChange` runs too, so nothing missed stays stale.
 */
export function useEventStream(eventRef: Ref<string | undefined>, onChange: () => void) {
  const status = ref<StreamStatus>('connecting');
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let connectedBefore = false;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };

  const close = () => {
    source?.close();
    source = null;
    clearTimeout(timer);
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
    source.addEventListener('change', schedule);
    source.onerror = () => {
      status.value = 'offline';
    };
  };

  watch(eventRef, (value) => (value ? open(value) : close()), { immediate: true });
  onBeforeUnmount(close);
  return { status };
}
