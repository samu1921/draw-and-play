import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, parseClock } from './time.js';

describe('time helpers', () => {
  it('formats minutes as a clock time', () => {
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(13 * 60 + 5)).toBe('13:05');
    expect(formatClock(24 * 60 + 30)).toBe('00:30');
  });

  it('parses clock times and rejects invalid ones', () => {
    expect(parseClock('10:30')).toBe(630);
    expect(parseClock(' 9:05 ')).toBe(545);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('10:60')).toBeNull();
    expect(parseClock('')).toBeNull();
  });

  it('formats durations as h:mm', () => {
    expect(formatDuration(210)).toBe('3:30');
    expect(formatDuration(45)).toBe('0:45');
  });
});
