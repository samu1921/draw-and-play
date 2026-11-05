import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface PersonView {
  id: string;
  name: string;
  publicName: string;
  firstName: string;
  lastName: string | null;
}

describe.skipIf(!databaseAvailable)('persons with a first name only', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  const ids: Record<string, string> = {};

  const list = async () => (await api('GET', `/api/events/${eventId}/persons`)).json().persons as PersonView[];
  const add = async (key: string, body: Record<string, unknown>) => {
    const res = await api('POST', `/api/events/${eventId}/persons`, body);
    expect(res.statusCode, key).toBe(201);
    ids[key] = res.json().person.id;
    return res.json().person as PersonView;
  };

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Vornamen', slug: 'vornamen' })).json().event.id;
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('creates persons without a last name', async () => {
    expect(await add('zoe', { firstName: 'Zoe' })).toMatchObject({ name: 'Zoe', lastName: null });
    expect(await add('max', { firstName: 'Max', lastName: '' })).toMatchObject({ name: 'Max', lastName: null });
    expect(await add('lea', { firstName: 'Lea', lastName: '   ' })).toMatchObject({ name: 'Lea', lastName: null });
    expect(await add('anna', { firstName: 'Anna', lastName: 'Becker' })).toMatchObject({ name: 'Anna Becker', lastName: 'Becker' });
    expect(await add('bernd', { firstName: 'Bernd', lastName: null })).toMatchObject({ name: 'Bernd', lastName: null });

    const missing = await api('POST', `/api/events/${eventId}/persons`, { lastName: 'Ohne' });
    expect(missing.json()).toMatchObject({ error: 'validation' });
  });

  it('sorts by last name, or by first name where there is none', async () => {
    expect((await list()).map((p) => p.name)).toEqual(['Anna Becker', 'Bernd', 'Lea', 'Max', 'Zoe']);
  });

  it('sets and clears the last name, and keeps it when it is not part of the change', async () => {
    const set = await api('PATCH', `/api/persons/${ids.max}`, { lastName: 'Muster' });
    expect(set.json().person).toMatchObject({ name: 'Max Muster', lastName: 'Muster' });
    const other = await api('PATCH', `/api/persons/${ids.max}`, { club: 'TTC' });
    expect(other.json().person).toMatchObject({ lastName: 'Muster', club: 'TTC' });
    const cleared = await api('PATCH', `/api/persons/${ids.max}`, { lastName: '' });
    expect(cleared.json().person).toMatchObject({ name: 'Max', lastName: null });
  });

  it('shows first names alone in public views, also with short names and in doubles', async () => {
    const competitionId = (
      await api('POST', `/api/events/${eventId}/competitions`, { name: 'Doppel', kind: 'doubles', format: { knockout: { placements: 'none' } } })
    ).json().competition.id;
    for (const pair of [
      [ids.zoe, ids.max],
      [ids.anna, ids.bernd],
    ]) {
      expect((await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: pair })).statusCode).toBe(201);
    }
    expect((await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'names' })).statusCode).toBe(200);

    const publicNames = async () => {
      const state = (await ctx.app.inject({ method: 'GET', url: `/api/competitions/${competitionId}/state` })).json();
      return (state.entries as { members: { name: string }[] }[]).map((e) => e.members.map((m) => m.name).join(' / ')).sort();
    };
    expect(await publicNames()).toEqual(['Anna Becker / Bernd', 'Zoe / Max']);

    expect((await api('PATCH', `/api/events/${eventId}`, { settings: { shortNames: true } })).statusCode).toBe(200);
    expect(await publicNames()).toEqual(['Anna B. / Bernd', 'Zoe / Max']);

    // The admin list carries the public form too, so equal-looking players can be spotted
    const anna = (await list()).find((p) => p.id === ids.anna)!;
    expect(anna).toMatchObject({ name: 'Anna Becker', publicName: 'Anna B.' });
  });
});
