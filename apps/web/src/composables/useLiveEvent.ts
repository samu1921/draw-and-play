import { DEFAULT_SPORT, getSportProfile, type SportProfile } from '@draw-and-play/domain';
import { computed, inject, onBeforeUnmount, provide, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import { api, type EventOverview, type Operations } from '../lib/api.js';
import { useEventStream, type ChangeMessage } from './useEventStream.js';

export interface LiveEvent {
  overview: Ref<EventOverview | null>;
  operations: Ref<Operations | null>;
  /** Scoring, result notation and rating name of the event's sport (the default sport until the event is loaded) */
  sport: ComputedRef<SportProfile>;
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
export function useLiveEvent(eventRef: Ref<string | undefined>, options: { operations?: boolean; remember?: boolean } = {}): LiveEvent {
  const overview = ref<EventOverview | null>(null);
  const operations = ref<Operations | null>(null);
  // With `remember`, the last answers are kept on the device, so a page reloaded without a connection still shows
  // the last known state (only for public data such as the table page).
  const snapshot = (kind: string) => `dap-snapshot:${kind}:${eventRef.value}`;
  const recall = <T>(target: Ref<T | null>, kind: string) => {
    if (!options.remember || target.value !== null) return;
    try {
      const raw = localStorage.getItem(snapshot(kind));
      if (raw) target.value = JSON.parse(raw) as T;
    } catch {
      // No storage, no snapshot
    }
  };
  const remember = (kind: string, value: unknown) => {
    if (!options.remember) return;
    try {
      localStorage.setItem(snapshot(kind), JSON.stringify(value));
    } catch {
      // Storage full or blocked: the page just has no snapshot after a reload
    }
  };
  const error = ref<unknown>(null);
  const listeners = new Set<(messages: ChangeMessage[]) => void>();

  async function reload() {
    const value = eventRef.value;
    if (!value) return;
    const path = `/api/events/${encodeURIComponent(value)}`;
    // Set independently: the overview is quick, the operations view resolves every competition.
    const load = async <T>(target: Ref<T | null>, url: string, kind: string) => {
      try {
        target.value = await api<T>('GET', url);
        error.value = null;
        remember(kind, target.value);
      } catch (e) {
        error.value = e;
        recall(target, kind);
      }
    };
    await Promise.all([load(overview, path, 'overview'), options.operations ? load(operations, `${path}/operations`, 'operations') : null]);
  }

  const { status } = useEventStream(eventRef, (messages) => {
    void reload();
    for (const listener of listeners) listener(messages);
  });
  watch(eventRef, () => void reload(), { immediate: true });

  const sport = computed(() => getSportProfile(overview.value?.event.sport ?? DEFAULT_SPORT));

  const live: LiveEvent = {
    overview,
    operations,
    sport,
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
