/** Calendar days as YYYY-MM-DD, independent of the time zone (computed in UTC) */

const MAX_DAYS = 31;

/** All days from the first to the last day of an event; one day without a last day, none without a first */
export function eventDays(startsOn: string | null, endsOn: string | null): string[] {
  if (!startsOn) return [];
  const days: string[] = [];
  const date = new Date(`${startsOn}T00:00:00Z`);
  const last = endsOn && endsOn > startsOn ? endsOn : startsOn;
  while (days.length < MAX_DAYS) {
    const iso = date.toISOString().slice(0, 10);
    days.push(iso);
    if (iso >= last) break;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

/** Noon in local time, so formatting never slips to the neighbouring day */
export const dayDate = (iso: string) => new Date(`${iso}T12:00:00`);
