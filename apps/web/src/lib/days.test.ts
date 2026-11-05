import { describe, expect, it } from 'vitest';
import { eventDays } from './days.js';

describe('eventDays', () => {
  it('lists every day from the first to the last', () => {
    expect(eventDays('2026-11-06', '2026-11-08')).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
  });

  it('crosses month ends and the change of daylight saving time', () => {
    expect(eventDays('2026-10-31', '2026-11-01')).toEqual(['2026-10-31', '2026-11-01']);
    expect(eventDays('2026-03-28', '2026-03-30')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('is one day without a last day or with a last day before the first', () => {
    expect(eventDays('2026-11-06', null)).toEqual(['2026-11-06']);
    expect(eventDays('2026-11-06', '2026-11-01')).toEqual(['2026-11-06']);
  });

  it('is empty without a first day and capped for long ranges', () => {
    expect(eventDays(null, '2026-11-06')).toEqual([]);
    expect(eventDays('2026-01-01', '2026-12-31')).toHaveLength(31);
  });
});
