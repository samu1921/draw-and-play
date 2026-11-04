import { inject, onBeforeUnmount, provide, ref, watch, type InjectionKey, type Ref } from 'vue';
import { api, type EventOverview, type Operations } from '../lib/api.js';
import { useEventStream, type ChangeMessage } from './useEventStream.js';

export interface LiveEvent {
  overview: Ref<EventOverview | null>;
  operations: Ref<Operations | null>;
  error: Ref<unknown>;
  status: ReturnType<typeof useEventStream>['status'];
  reload: () => Promise<void>;
  /** Runs `callback` after every burst of changes pushed by the server, until the calling component unmounts */
  onChange: (callback: (messages: ChangeMessage[]) => void) => void;
}

const LIVE_EVENT: InjectionKey<LiveEvent> = Symbol('liveEvent');

/**
 * Loads an event (and optionally its operations view) and keeps it current through one live stream per page.
 * Child components get it with `injectLiveEvent()`.
 */
export function useLiveEvent(eventRef: Ref<string | undefined>, options: { operations?: boolean } = {}): LiveEvent {
  const overview = ref<EventOverview | null>(null);
  const operations = ref<Operations | null>(null);
  const error = ref<unknown>(null);
  const listeners = new Set<(messages: ChangeMessage[]) => void>();

  async function reload() {
    const value = eventRef.value;
    if (!value) return;
    const path = `/api/events/${encodeURIComponent(value)}`;
    // Set independently: the overview is quick, the operations view resolves every competition.
    const load = async <T>(target: Ref<T | null>, url: string) => {
      try {
        target.value = await api<T>('GET', url);
        error.value = null;
      } catch (e) {
        error.value = e;
      }
    };
    await Promise.all([load(overview, path), options.operations ? load(operations, `${path}/operations`) : null]);
  }

  const { status } = useEventStream(eventRef, (messages) => {
    void reload();
    for (const listener of listeners) listener(messages);
  });
  watch(eventRef, () => void reload(), { immediate: true });

  const live: LiveEvent = {
    overview,
    operations,
    error,
    status,
    reload,
    onChange(callback) {
      listeners.add(callback);
      onBeforeUnmount(() => listeners.delete(callback));
    },
  };
  provide(LIVE_EVENT, live);
  return live;
}

export function injectLiveEvent(): LiveEvent {
  const live = inject(LIVE_EVENT);
  if (!live) throw new Error('injectLiveEvent() needs useLiveEvent() in a parent component');
  return live;
}
