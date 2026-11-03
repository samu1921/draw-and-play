import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { api, type Forecast } from '../lib/api.js';
import { injectLiveEvent } from './useLiveEvent.js';

/** The live forecast of the current event, refreshed on every change and once a minute (the clock moves on). */
export function useForecast(day: Ref<string | null>) {
  const live = injectLiveEvent();
  const forecast = ref<Forecast | null>(null);

  async function load() {
    const ref = live.overview.value?.event.slug;
    if (!ref) return;
    const query = day.value ? `?day=${day.value}` : '';
    forecast.value = await api<Forecast>('GET', `/api/events/${encodeURIComponent(ref)}/forecast${query}`).catch(() => forecast.value);
  }

  watch([day, () => live.overview.value?.event.slug], () => void load(), { immediate: true });
  live.onChange(() => void load());
  const timer = setInterval(() => void load(), 60_000);
  onBeforeUnmount(() => clearInterval(timer));
  return { forecast, reload: load };
}
