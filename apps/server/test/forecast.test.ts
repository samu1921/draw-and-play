import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { events } from '../src/db/schema.js';
import { eventForecast, localTime } from '../src/services/forecast.js';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

describe('localTime', () => {
  it('converts to the event time zone', () => {
    expect(localTime(new Date('2026-11-07T09:30:00Z'), 'Europe/Berlin')).toEqual({ day: '2026-11-07', minutes: 10 * 60 + 30 });
    expect(localTime(new Date('2026-11-07T23:30:00Z'), 'Europe/Berlin')).toEqual({ day: '2026-11-08', minutes: 30 });
  });
});

describe.skipIf(!databaseAvailable)('live forecast', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let tableIds: string[];
  let competitionId: string;
  // Saturday 7 Nov 2026, 10:40 in Berlin
  const now = new Date('2026-11-07T09:40:00Z');
  const forecast = async (day?: string) => {
    const [event] = await ctx.db.select().from(events).where(eq(events.id, eventId));
    return eventForecast(ctx.db, event!, day, now);
  };

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Forecast', slug: 'forecast', tableCount: 2 })).json().event.id;
    // Public views open to everybody; the viewer code has its own tests
    await api('DELETE', `/api/events/${eventId}/viewer-code`);
    tableIds = (await ctx.app.inject({ method: 'GET', url: '/api/events/forecast' })).json().tables.map((t: { id: string }) => t.id);
    competitionId = (
      await api('POST', `/api/events/${eventId}/competitions`, { name: 'Hobby', day: '2026-11-07', earliestStart: 600, format: { groups: { groupCount: 1 } } })
    ).json().competition.id;
    await api('POST', `/api/events/${eventId}/competitions`, { name: 'Sunday', day: '2026-11-08', earliestStart: 540, format: { groups: { groupCount: 1 } } });
    for (let i = 0; i < 4; i++) {
      const person = (await api('POST', `/api/events/${eventId}/persons`, { firstName: `P${i}`, lastName: 'F' })).json().person;
      await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [person.id] });
    }
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('plans an undrawn competition from its entries, starting now on the current day', async () => {
    const f = await forecast();
    expect(f).toMatchObject({ day: '2026-11-07', days: ['2026-11-07', '2026-11-08'], live: true, now: 640 });
    expect(f.competitions).toHaveLength(1);
    // 6 matches of 30 minutes on 2 tables: 3 rounds from 10:40
    expect(f.matches).toHaveLength(6);
    expect(f.competitions[0]).toMatchObject({ start: 640, end: 640 + 90 });
  });

  it('plans a future day from its first start', async () => {
    const f = await forecast('2026-11-08');
    expect(f).toMatchObject({ day: '2026-11-08', live: false, now: 540 });
    expect(f.skipped).toEqual([{ id: expect.any(String), reason: 'tooFewEntries' }]);
  });

  it('keeps played and running matches and plans the rest around them', async () => {
    await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'f' });
    const state = (await api('GET', `/api/competitions/${competitionId}/state`)).json();
    const [first, second] = state.matches.filter((m: { status: string }) => m.status === 'ready');
    await api('POST', `/api/matches/${first.id}/result`, { notation: '1 2 3', version: first.version });
    await api('POST', `/api/matches/${second.id}/call`, { tableId: tableIds[1], version: second.version });

    const f = await forecast();
    // 4 matches left to plan; the running one is not among them
    expect(f.matches).toHaveLength(4);
    expect(f.matches.some((m) => m.matchKey === second.key)).toBe(false);
    // Table 2 is busy until the running match is expected to end (called "now" in the test clock, 30 minutes)
    const onTable2 = f.matches.filter((m) => m.tableId === tableIds[1]).sort((a, b) => a.start - b.start);
    expect(onTable2[0]!.start).toBeGreaterThanOrEqual(640 + 5);
  });

  it('is available as a public endpoint', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/events/forecast/forecast?day=2026-11-07' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ day: '2026-11-07' });
  });
});
