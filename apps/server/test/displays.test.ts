import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChangeMessage } from '../src/realtime/broadcaster.js';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

describe.skipIf(!databaseAvailable)('display profiles via the API', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let profileId: string;
  const messages: ChangeMessage[] = [];

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Anzeige', slug: 'anzeige' })).json().event.id;
    // Public views open to everybody; the viewer code has its own tests
    await api('DELETE', `/api/events/${eventId}/viewer-code`);
    ctx.broadcaster.subscribe(eventId, (m) => messages.push(m));
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('creates a profile with defaults and remembers who built it', async () => {
    const created = await api('POST', `/api/events/${eventId}/displays`, { name: 'Halle', settings: { slideSeconds: 30, tables: false } });
    expect(created.statusCode).toBe(201);
    profileId = created.json().display.id;
    expect(created.json().display).toMatchObject({
      name: 'Halle',
      createdBy: 'admin',
      settings: { slideSeconds: 30, tables: false, next: true, entries: true, competitionIds: null, todayOnly: false, liveDraw: true, rules: true },
    });
    expect(messages.at(-1)).toEqual({ eventId, type: 'display', id: profileId });

    const list = await api('GET', `/api/events/${eventId}/displays`);
    expect(list.json().displays.map((d: { name: string }) => d.name)).toEqual(['Halle']);
  });

  it('shows a profile to everyone, but only admins change it', async () => {
    const pub = await ctx.app.inject({ method: 'GET', url: `/api/displays/${profileId}` });
    expect(pub.json().display).toMatchObject({ name: 'Halle', eventId, settings: { slideSeconds: 30 } });
    expect((await ctx.app.inject({ method: 'GET', url: `/api/events/${eventId}/displays` })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'PATCH', url: `/api/displays/${profileId}`, payload: { version: 1 } })).statusCode).toBe(401);
  });

  it('merges setting changes and guards against lost updates', async () => {
    const updated = await api('PATCH', `/api/displays/${profileId}`, { settings: { next: false }, version: 1 });
    expect(updated.json().display).toMatchObject({ version: 2, settings: { slideSeconds: 30, tables: false, next: false } });
    const stale = await api('PATCH', `/api/displays/${profileId}`, { name: 'Alt', version: 1 });
    expect(stale.json()).toMatchObject({ error: 'versionConflict' });
    const invalid = await api('PATCH', `/api/displays/${profileId}`, { settings: { slideSeconds: 1 }, version: 2 });
    expect(invalid.json()).toMatchObject({ error: 'validation' });
  });

  it('deletes a profile', async () => {
    expect((await api('DELETE', `/api/displays/${profileId}`)).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/displays/${profileId}` })).statusCode).toBe(404);
  });

  it('announces draws so displays can show them live', async () => {
    const competition = (await api('POST', `/api/events/${eventId}/competitions`, { name: 'Hobby', format: { groups: { groupCount: 1 } } })).json()
      .competition.id;
    for (let i = 0; i < 3; i++) {
      const person = (await api('POST', `/api/events/${eventId}/persons`, { firstName: `P${i}`, lastName: 'D' })).json().person;
      await api('POST', `/api/competitions/${competition}/entries`, { personIds: [person.id] });
    }
    await api('POST', `/api/competitions/${competition}/draw`, {});
    expect(messages.at(-1)).toEqual({ eventId, type: 'draw', id: competition });
  });
});
