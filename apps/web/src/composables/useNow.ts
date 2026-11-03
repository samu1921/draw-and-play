import { onBeforeUnmount, ref } from 'vue';

/** The current time, updated every `intervalMs` (for running match timers and clocks). */
export function useNow(intervalMs = 1000) {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), intervalMs);
  onBeforeUnmount(() => clearInterval(timer));
  return now;
}

/** "12:34" for minutes and seconds since `iso` */
export function elapsed(iso: string | null, now: number): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
