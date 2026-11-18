import { ref, watch, type Ref } from 'vue';
import type { Forecast } from '../lib/api.js';

/**
 * Expected start per match (`competitionId:key`, minutes since midnight) from the live forecast.
 * A forecast for another day is ignored, so picking a day in the forecast panel keeps today's times.
 */
export function usePlannedStarts(forecast: Ref<Forecast | null>) {
  const planned = ref<ReadonlyMap<string, number>>(new Map());
  const now = ref<number | null>(null);
  watch(
    forecast,
    (f) => {
      if (!f?.live) return;
      planned.value = new Map(f.matches.map((m) => [`${m.competitionId}:${m.matchKey}`, m.start]));
      now.value = f.now;
    },
    { immediate: true },
  );
  return { planned, now };
}
