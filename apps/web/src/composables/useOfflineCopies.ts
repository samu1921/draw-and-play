import { onBeforeUnmount, watch } from 'vue';
import type { CompetitionStateInfo } from '../lib/api.js';
import { loadRemembered } from '../lib/snapshot.js';
import type { LiveEvent } from './useLiveEvent.js';

/** At most one round of copies in this time, however many results come in */
const REFRESH_MS = 30_000;

/**
 * Keeps a copy of every competition of the event on this device while the connection is there, so the
 * competition pages also open without a connection, including those not opened before.
 * Runs when the live stream connects and after changes, at most every 30 seconds.
 */
export function useOfflineCopies(live: LiveEvent) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  async function copy() {
    const overview = live.overview.value;
    if (running || !overview || live.status.value !== 'live') return;
    running = true;
    last = Date.now();
    try {
      await Promise.all([
        loadRemembered('staff', `persons:${overview.event.id}`, `/api/events/${overview.event.id}/persons`),
        ...overview.competitions.map((c) => loadRemembered<CompetitionStateInfo>('staff', `state:${c.id}`, `/api/competitions/${c.id}/state`)),
      ]);
    } catch {
      // Tried again with the next change
    } finally {
      running = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void copy(), Math.max(0, last + REFRESH_MS - Date.now()));
  }

  watch(
    () => live.status.value === 'live' && live.overview.value !== null,
    (ready) => ready && schedule(),
    { immediate: true },
  );
  live.onChange(schedule);
  onBeforeUnmount(() => clearTimeout(timer));
}
