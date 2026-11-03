import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SLUG, demoWeekend, seedDemo } from '../src/demo/seed.js';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

describe('demoWeekend', () => {
  it('picks the coming Friday and Saturday', () => {
    expect(demoWeekend(new Date(2026, 10, 3))).toEqual({ friday: '2026-11-06', saturday: '2026-11-07' }); // Tuesday
    expect(demoWeekend(new Date(2026, 10, 6))).toEqual({ friday: '2026-11-06', saturday: '2026-11-07' }); // Friday
    expect(demoWeekend(new Date(2026, 10, 7))).toEqual({ friday: '2026-11-06', saturday: '2026-11-07' }); // Saturday
    expect(demoWeekend(new Date(2026, 10, 8))).toEqual({ friday: '2026-11-13', saturday: '2026-11-14' }); // Sunday
  });
});

describe.skipIf(!databaseAvailable)('demo data', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('creates the club championship once', async () => {
    expect(await seedDemo(ctx.db, new Date(2026, 10, 3))).toBe(true);
    expect(await seedDemo(ctx.db, new Date(2026, 10, 3))).toBe(false);

    const overview = (await ctx.app.inject({ method: 'GET', url: `/api/events/${DEMO_SLUG}` })).json();
    expect(overview.event).toMatchObject({ startsOn: '2026-11-06', endsOn: '2026-11-07', pinEnabled: true });
    expect(overview.tables).toHaveLength(4);
    expect(overview.competitions.map((c: { name: string }) => c.name)).toEqual([
      'Jugend U19',
      'Jugend U14',
      'Jugend Anfänger',
      'Doppel',
      'Einzel Aktive',
      'Hobby',
    ]);
    const singles = overview.competitions.find((c: { name: string }) => c.name === 'Einzel Aktive');
    const doubles = overview.competitions.find((c: { name: string }) => c.name === 'Doppel');
    expect(singles.startAfterId).toBe(doubles.id);
  });

  it('accepts the demo PIN', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: `/api/events/${DEMO_SLUG}/device`, payload: { pin: '123456' } });
    expect(res.statusCode).toBe(200);
  });

  it('has a valid format for every competition, so everything can be drawn', async () => {
    const overview = (await ctx.app.inject({ method: 'GET', url: `/api/events/${DEMO_SLUG}` })).json();
    const expected: Record<string, number> = { 'Jugend U19': 10, 'Jugend U14': 10, 'Jugend Anfänger': 10, Doppel: 12 + 4, 'Einzel Aktive': 18 + 6, Hobby: 10 };
    for (const c of overview.competitions as { id: string; name: string }[]) {
      expect((await api('POST', `/api/competitions/${c.id}/draw`, { seed: 'demo' })).statusCode, c.name).toBe(200);
      const state = (await api('GET', `/api/competitions/${c.id}/state`)).json();
      expect(state.matches, c.name).toHaveLength(expected[c.name]!);
    }
  });
});
