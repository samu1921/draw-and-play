import { describe, expect, it } from 'vitest';
import type { CompetitionFormat } from './format.js';
import { compareVariants, generateVariants, simulatePlan, type CompetitionPlan, type PlanInput } from './planner.js';

const tables = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const START = 10 * 60;

function forecast(entryCount: number, format: CompetitionFormat, tableCount = 6, matchMinutes = 30) {
  const plan = simulatePlan({
    tables: tables(tableCount),
    startMin: START,
    competitions: [{ id: 'singles', entryCount, format, matchMinutes }],
  });
  const c = plan.competitions[0]!;
  return { matches: c.matchCount, perEntry: [c.matchesPerEntry.min, c.matchesPerEntry.max], minutes: c.end - c.start };
}

const rr: CompetitionFormat = { groups: { groupCount: 1 } };
const groups = (groupCount: number, k: number): CompetitionFormat => ({
  groups: { groupCount },
  knockout: { qualifiersPerGroup: k, placements: 'none' },
});

// Example calculations from the concept (chapter 3.3): 6 tables, 30 minutes per match, no buffer.
describe('simulatePlan reproduces the concept examples', () => {
  it.each([
    ['1 group', rr, 45, [9, 9], 270],
    ['2 × 5, top 2 → semifinals', groups(2, 2), 23, [4, 6], 210],
    ['3 × (4/3/3), top 2 → bracket of 8, 2 byes', groups(3, 2), 17, [2, 6], 180],
  ] as const)('10 entries, %s', (_, format, matches, perEntry, minutes) => {
    expect(forecast(10, format)).toEqual({ matches, perEntry, minutes });
  });

  it.each([
    ['1 group', rr, 66, [11, 11], 330],
    ['2 × 6, top 2 → semifinals', groups(2, 2), 33, [5, 7], 210],
    ['2 × 6, top 4 → quarterfinals', groups(2, 4), 37, [5, 8], 240],
    ['3 × 4, top 2 → bracket of 8, 2 byes', groups(3, 2), 23, [3, 6], 180],
    ['4 × 3, top 2 → quarterfinals', groups(4, 2), 19, [2, 5], 180],
  ] as const)('12 entries, %s', (_, format, matches, perEntry, minutes) => {
    expect(forecast(12, format)).toEqual({ matches, perEntry, minutes });
  });

  it.each([
    ['2 × 8, top 2 → semifinals', groups(2, 2), 59, [7, 9], 360, 270],
    ['3 × (6/5/5), top 2 → bracket of 8, 2 byes', groups(3, 2), 40, [4, 8], 270, 240],
    ['4 × 4, top 2 → quarterfinals', groups(4, 2), 31, [3, 6], 210, 180],
  ] as const)('16 entries, %s (6 and 8 tables)', (_, format, matches, perEntry, six, eight) => {
    expect(forecast(16, format, 6)).toEqual({ matches, perEntry, minutes: six });
    expect(forecast(16, format, 8).minutes).toBe(eight);
  });

  it('youth/hobby with 5 entries: 10 matches, 2:30 h best of 5, 1:40 h best of 3', () => {
    expect(forecast(5, rr)).toEqual({ matches: 10, perEntry: [4, 4], minutes: 150 });
    expect(forecast(5, rr, 6, 20).minutes).toBe(100);
  });

  it('three youth competitions fit in parallel on 6 tables', () => {
    const plan = simulatePlan({
      tables: tables(6),
      startMin: START,
      competitions: ['u19', 'u14', 'beginners'].map((id) => ({ id, entryCount: 5, format: rr, matchMinutes: 30 })),
    });
    expect(plan.end - START).toBe(150);
    expect(plan.competitions.map((c) => c.end - START)).toEqual([150, 150, 150]);
  });
});

describe('simulatePlan across competitions', () => {
  const doubles: CompetitionPlan = { id: 'doubles', entryCount: 8, format: groups(2, 2), matchMinutes: 30 };

  it('starts a competition only after the ones it waits for', () => {
    const plan = simulatePlan({
      tables: tables(4),
      startMin: START,
      competitions: [doubles, { id: 'singles', entryCount: 12, format: groups(4, 2), matchMinutes: 30, startAfter: ['doubles'] }],
    });
    const [d, s] = plan.competitions;
    expect(s!.start).toBe(d!.end);
  });

  it('respects an earliest start and allowed tables', () => {
    const plan = simulatePlan({
      tables: tables(8),
      startMin: START,
      competitions: [{ id: 'hobby', entryCount: 5, format: rr, matchMinutes: 20, earliestStart: 13 * 60, tables: ['T7', 'T8'] }],
    });
    expect(plan.competitions[0]!.start).toBe(13 * 60);
    expect(new Set(plan.matches.map((m) => m.table))).toEqual(new Set(['T7', 'T8']));
    expect(plan.matches.every((m) => m.competitionId === 'hobby' && m.match.phase === 'group')).toBe(true);
  });

  it('never schedules the same person in two competitions at once', () => {
    // Every seat of both competitions is the same person: nothing may overlap.
    const everyone = () => ['Sam'];
    const plan = simulatePlan({
      tables: tables(4),
      startMin: START,
      competitions: [
        { id: 'a', entryCount: 3, format: rr, matchMinutes: 30, participants: everyone },
        { id: 'b', entryCount: 3, format: rr, matchMinutes: 30, participants: everyone },
      ],
    });
    const sorted = [...plan.matches].sort((x, y) => x.start - y.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
    expect(plan.end - START).toBe(6 * 30);
  });

  it('adds the buffer as a range', () => {
    const plan = simulatePlan({
      tables: tables(6),
      startMin: START,
      buffer: { percent: 10, minutes: 15 },
      competitions: [{ id: 'youth', entryCount: 5, format: rr, matchMinutes: 30 }],
    });
    expect(plan.end - START).toBe(150);
    expect(plan.endLate - START).toBe(150 + 15 + 15);
    expect(plan.competitions[0]!.endLate).toBe(plan.endLate);
  });

  it('reports table utilization and the longest wait', () => {
    const plan = simulatePlan({
      tables: tables(2),
      startMin: START,
      competitions: [{ id: 'youth', entryCount: 5, format: rr, matchMinutes: 30 }],
    });
    // 10 matches on 2 tables in 5 slots: fully used; everybody sits out exactly one round
    expect(plan.tableUtilization).toBe(1);
    expect(plan.competitions[0]!.longestWaitMin).toBe(30);
  });

  it('includes the break between the group stage and the knockout', () => {
    const plan = simulatePlan({
      tables: tables(6),
      startMin: START,
      minRestMin: 10,
      competitions: [{ id: 'singles', entryCount: 8, format: groups(2, 2), matchMinutes: 30 }],
    });
    const c = plan.competitions[0]!;
    expect(c.groupStageEnd).toBeDefined();
    expect(c.longestWaitMin).toBeGreaterThanOrEqual(10);
  });
});

describe('generateVariants', () => {
  const ids = (n: number) => generateVariants(n).map((v) => v.id);

  it('offers the formats from the concept for 10, 12 and 16 entries', () => {
    expect(ids(10)).toEqual(expect.arrayContaining(['rr', 'g2-top2', 'g3-top2', 'ko']));
    expect(ids(12)).toEqual(expect.arrayContaining(['rr', 'g2-top2', 'g2-top4', 'g3-top2', 'g4-top2']));
    expect(ids(16)).toEqual(expect.arrayContaining(['g2-top2', 'g3-top2', 'g4-top2']));
  });

  it('leaves out formats that make no sense', () => {
    expect(ids(16)).not.toContain('rr'); // 120 matches
    expect(ids(5)).toEqual(['rr', 'rr-top2', 'ko']);
    expect(ids(12)).not.toContain('g4-top4'); // nobody would drop out of a group of 3
  });

  it('every variant builds and simulates', () => {
    for (const n of [4, 5, 7, 10, 12, 16, 24]) {
      const input: PlanInput = { tables: tables(6), startMin: START, competitions: [{ id: 'c', entryCount: n, format: rr, matchMinutes: 30 }] };
      for (const row of compareVariants(input, 'c', generateVariants(n))) {
        expect(row.forecast.unscheduled, `${n} entries, ${row.variant.id}`).toBe(0);
        expect(row.forecast.end).toBeGreaterThan(START);
      }
    }
  });
});

describe('compareVariants', () => {
  it('compares one competition while keeping the others', () => {
    const input: PlanInput = {
      tables: tables(4),
      startMin: START,
      competitions: [
        { id: 'doubles', entryCount: 8, format: groups(2, 2), matchMinutes: 30 },
        { id: 'singles', entryCount: 12, format: rr, matchMinutes: 30, startAfter: ['doubles'] },
      ],
    };
    const rows = compareVariants(input, 'singles', generateVariants(12));
    const byId = new Map(rows.map((r) => [r.variant.id, r]));
    // Fewer, smaller groups finish earlier
    expect(byId.get('g4-top2')!.forecast.end).toBeLessThan(byId.get('rr')!.forecast.end);
    // The doubles competition is unaffected, so the singles always start at the same time
    expect(new Set(rows.map((r) => r.forecast.start)).size).toBe(1);
  });
});

describe('simulatePlan with the live state (forecast during the tournament)', () => {
  const live = (fixed: [string, { table: string; start: number; end: number }][], participants: [string, string[]][] = []) => ({
    fixed: new Map(fixed),
    participants: new Map(participants),
  });

  it('keeps played and running matches and plans only the rest from now on', () => {
    // 4 entries round robin on 2 tables: round 1 is played, one match of round 2 is running.
    const plan = simulatePlan({
      tables: tables(2),
      startMin: 650,
      competitions: [
        {
          id: 'c',
          entryCount: 4,
          format: rr,
          matchMinutes: 30,
          live: live([
            ['GA-1-1', { table: 'T1', start: 600, end: 630 }],
            ['GA-1-2', { table: 'T2', start: 600, end: 635 }],
            ['GA-2-1', { table: 'T1', start: 640, end: 670 }],
          ]),
        },
      ],
    });
    const byKey = new Map(plan.matches.map((m) => [m.match.id, m]));
    expect(byKey.get('GA-1-1')).toMatchObject({ start: 600, end: 630, table: 'T1' });
    // The free table takes the other round-2 match right now; round 3 follows once its players are free.
    expect(byKey.get('GA-2-2')).toMatchObject({ start: 650, table: 'T2' });
    expect(plan.competitions[0]!.start).toBe(600);
    expect(plan.end).toBe(710);
  });

  it('uses the real players of known matches, so people are not booked twice across competitions', () => {
    const plan = simulatePlan({
      tables: tables(4),
      startMin: 600,
      competitions: [
        { id: 'a', entryCount: 2, format: rr, matchMinutes: 30, live: live([], [['GA-1-1', ['Sam', 'Kim']]]) },
        { id: 'b', entryCount: 2, format: rr, matchMinutes: 30, live: live([], [['GA-1-1', ['Sam', 'Lou']]]) },
      ],
    });
    const [a, b] = plan.matches.sort((x, y) => x.start - y.start);
    expect(b!.start).toBeGreaterThanOrEqual(a!.end);
  });

  it('keeps a running match on its table until it is expected to finish', () => {
    const plan = simulatePlan({
      tables: tables(1),
      startMin: 610,
      competitions: [
        { id: 'c', entryCount: 3, format: rr, matchMinutes: 30, live: live([['GA-1-1', { table: 'T1', start: 600, end: 630 }]]) },
      ],
    });
    const next = plan.matches.filter((m) => m.match.id !== 'GA-1-1').sort((x, y) => x.start - y.start)[0]!;
    expect(next.start).toBe(630);
  });
});
