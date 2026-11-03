import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface EntryView {
  id: string;
  seed: number | null;
  status: string;
  members: { id: string; rating: number | null }[];
}

describe.skipIf(!databaseAvailable)('doubles pair draw via the API', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let competitionId: string;
  /** Strongest first */
  const personIds: string[] = [];

  const entries = async () =>
    ((await api('GET', `/api/competitions/${competitionId}/state`)).json().entries as EntryView[]);

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Doppel', slug: 'doppel' })).json().event.id;
    competitionId = (
      await api('POST', `/api/events/${eventId}/competitions`, { name: 'Doppel', kind: 'doubles', format: { groups: { groupCount: 2 } } })
    ).json().competition.id;
    for (let i = 0; i < 8; i++) {
      const person = (await api('POST', `/api/events/${eventId}/persons`, { firstName: `D${i + 1}`, lastName: 'Test', rating: 1800 - i * 50 })).json().person;
      personIds.push(person.id);
    }
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('takes single players into a doubles competition, but no draw while someone has no partner', async () => {
    for (const id of personIds.slice(0, 7)) {
      expect((await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [id], status: 'present' })).statusCode).toBe(201);
    }
    const odd = await api('POST', `/api/competitions/${competitionId}/pairs/draw`, {});
    expect(odd.json()).toEqual({ error: 'oddPlayerCount', details: { count: 7 } });

    await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [personIds[7]], status: 'present' });
    const draw = await api('POST', `/api/competitions/${competitionId}/draw`, {});
    expect(draw.json()).toEqual({ error: 'unpairedPlayers', details: { count: 8 } });
  });

  it('pairs the upper half of the seeding list with a drawn partner from the lower half, reproducibly', async () => {
    const first = await api('POST', `/api/competitions/${competitionId}/pairs/draw`, { seed: 'pairs' });
    expect(first.statusCode).toBe(200);
    const pairs = (await entries()).map((e) => e.members.map((m) => m.id));
    expect(pairs).toHaveLength(4);
    expect(pairs.map((p) => p[0]).sort()).toEqual(personIds.slice(0, 4).sort());
    expect(pairs.map((p) => p[1]).sort()).toEqual(personIds.slice(4).sort());
    expect((await entries()).every((e) => e.status === 'present')).toBe(true);

    const split = await api('POST', `/api/competitions/${competitionId}/pairs/split`, {});
    expect(split.json()).toEqual({ split: 4 });
    expect((await entries()).every((e) => e.members.length === 1)).toBe(true);

    const second = await api('POST', `/api/competitions/${competitionId}/pairs/draw`, { seed: 'pairs' });
    expect(second.json().pairs.map((p: { personIds: string[] }) => p.personIds)).toEqual(
      first.json().pairs.map((p: { personIds: string[] }) => p.personIds),
    );
  });

  it('splits a single pair and draws the competition once everyone has a partner', async () => {
    const [pair] = await entries();
    expect((await api('POST', `/api/competitions/${competitionId}/pairs/split`, { entryIds: [pair!.id] })).json()).toEqual({ split: 1 });
    expect((await entries()).filter((e) => e.members.length === 1)).toHaveLength(2);
    expect((await api('POST', `/api/competitions/${competitionId}/pairs/draw`, { mode: 'random' })).statusCode).toBe(200);

    const draw = await api('POST', `/api/competitions/${competitionId}/draw`, { seedCount: 2, seedPlacement: 'drawn' });
    expect(draw.statusCode).toBe(200);
    expect(draw.json().draw.groups.flat()).toHaveLength(4);
    const late = await api('POST', `/api/competitions/${competitionId}/pairs/split`, {});
    expect(late.json()).toEqual({ error: 'alreadyDrawn' });
  });

  it('refuses pair draws in singles competitions', async () => {
    const singles = (await api('POST', `/api/events/${eventId}/competitions`, { name: 'Einzel', format: { groups: { groupCount: 1 } } })).json()
      .competition.id;
    expect((await api('POST', `/api/competitions/${singles}/pairs/draw`, {})).json()).toEqual({ error: 'notDoubles' });
  });
});
