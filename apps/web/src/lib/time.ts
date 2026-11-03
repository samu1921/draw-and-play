const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes since midnight → "HH:MM" (wraps past midnight) */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "HH:MM" → minutes since midnight; null if invalid */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** Minutes → "h:mm", e.g. 210 → "3:30" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}
