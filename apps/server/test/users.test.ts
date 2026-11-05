import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

describe.skipIf(!databaseAvailable)('users and roles', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let admin: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let competitionId: string;
  let deskId: string;
  const DESK = { username: 'meldestelle', password: 'desk password 2026' };

  /** Logs in and returns a client bound to that session */
  async function login(credentials: { username: string; password: string }) {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: credentials });
    expect(res.statusCode, res.body).toBe(200);
    const cookie = res.cookies.find((c) => c.name === 'dap_session')!.value;
    return (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      ctx.app.inject({ method, url, ...(payload && { payload }), cookies: { dap_session: cookie } });
  }

  beforeAll(async () => {
    ctx = await setupTestApp();
    admin = await adminClient(ctx.app);
    eventId = (await admin('POST', '/api/events', { name: 'Rollen', slug: 'rollen', tableCount: 2 })).json().event.id;
    competitionId = (await admin('POST', `/api/events/${eventId}/competitions`, { name: 'Einzel', format: { groups: { groupCount: 1 } } })).json()
      .competition.id;
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('creates accounts with a role', async () => {
    expect((await admin('GET', '/api/auth/me')).json().user).toMatchObject({ username: ADMIN.username, role: 'admin' });
    expect((await admin('POST', '/api/users', { ...DESK, password: 'too short' })).json()).toMatchObject({ error: 'validation' });
    const res = await admin('POST', '/api/users', { ...DESK, role: 'desk' });
    expect(res.statusCode).toBe(201);
    deskId = res.json().user.id;
    expect(res.json().user).toMatchObject({ username: DESK.username, role: 'desk' });
    expect((await admin('POST', '/api/users', { ...DESK, role: 'desk' })).json()).toEqual({ error: 'usernameTaken' });
    expect((await admin('GET', '/api/users')).json().users.map((u: { username: string }) => u.username)).toEqual(['admin', 'meldestelle']);
  });

  it('lets the registration desk handle players and entries, but nothing else', async () => {
    const desk = await login(DESK);
    expect((await desk('GET', '/api/auth/me')).json().user.role).toBe('desk');
    expect((await desk('GET', '/api/events')).statusCode).toBe(200);

    const person = await desk('POST', `/api/events/${eventId}/persons`, { firstName: 'Anna', lastName: 'Berger' });
    expect(person.statusCode).toBe(201);
    expect((await desk('POST', `/api/events/${eventId}/persons/import`, { rows: [{ firstName: 'Ben' }, { firstName: 'Clara' }] })).statusCode).toBe(200);
    const entry = await desk('POST', `/api/competitions/${competitionId}/entries`, { personIds: [person.json().person.id] });
    expect(entry.statusCode).toBe(201);
    expect((await desk('PATCH', `/api/entries/${entry.json().entry.id}`, { status: 'present' })).statusCode).toBe(200);
    expect((await desk('GET', `/api/events/${eventId}/persons`)).statusCode).toBe(200);
    expect((await desk('GET', '/api/events/rollen')).json().event.viewerCode).toBeUndefined();

    const refused = [
      await desk('POST', '/api/events', { name: 'Nope' }),
      await desk('PATCH', `/api/events/${eventId}`, { name: 'Nope' }),
      await desk('POST', `/api/events/${eventId}/competitions`, { name: 'Nope', format: { groups: { groupCount: 1 } } }),
      await desk('POST', `/api/competitions/${competitionId}/draw`, {}),
      await desk('POST', `/api/events/${eventId}/pin`),
      await desk('POST', `/api/events/${eventId}/viewer-code`),
      await desk('GET', `/api/events/${eventId}/audit`),
      await desk('GET', `/api/events/${eventId}/export`),
      await desk('GET', '/api/users'),
    ];
    expect(refused.map((r) => r.statusCode)).toEqual(refused.map(() => 403));
    expect(refused[0]!.json()).toEqual({ error: 'adminOnly' });
  });

  it('does not let the registration desk enter results like the tournament desk', async () => {
    const desk = await login(DESK);
    // Two more players and a draw, so matches exist
    const persons = (await admin('GET', `/api/events/${eventId}/persons`)).json().persons as { id: string; firstName: string }[];
    for (const name of ['Ben', 'Clara']) {
      await admin('POST', `/api/competitions/${competitionId}/entries`, { personIds: [persons.find((p) => p.firstName === name)!.id] });
    }
    expect((await admin('POST', `/api/competitions/${competitionId}/draw`, {})).statusCode).toBe(200);
    const match = (await admin('GET', `/api/competitions/${competitionId}/state`)).json().matches.find((m: { status: string }) => m.status === 'ready');
    const res = await desk('POST', `/api/matches/${match.id}/result`, { notation: '5 5 5', version: match.version });
    expect(res.statusCode).toBe(401);
  });

  it('changes the own password and signs out the other sessions', async () => {
    const first = await login(DESK);
    const second = await login(DESK);
    expect((await first('POST', '/api/auth/password', { current: 'wrong', next: 'a new desk password' })).json()).toEqual({ error: 'invalidCredentials' });
    expect((await first('POST', '/api/auth/password', { current: DESK.password, next: 'a new desk password' })).statusCode).toBe(204);
    expect((await first('GET', '/api/auth/me')).json().user).not.toBeNull();
    expect((await second('GET', '/api/auth/me')).json().user).toBeNull();
    DESK.password = 'a new desk password';
  });

  it('resets passwords and roles as admin, which signs that user out', async () => {
    const desk = await login(DESK);
    expect((await admin('PATCH', `/api/users/${deskId}`, { password: 'reset by the admin' })).statusCode).toBe(200);
    expect((await desk('GET', '/api/auth/me')).json().user).toBeNull();
    DESK.password = 'reset by the admin';
    expect((await admin('PATCH', `/api/users/${deskId}`, { role: 'admin' })).json().user.role).toBe('admin');
    expect((await (await login(DESK))('GET', '/api/users')).statusCode).toBe(200);
  });

  it('always keeps an admin and refuses to delete the own account', async () => {
    const me = (await admin('GET', '/api/auth/me')).json().user.id;
    expect((await admin('DELETE', `/api/users/${me}`)).json()).toEqual({ error: 'cannotDeleteSelf' });
    expect((await admin('PATCH', `/api/users/${deskId}`, { role: 'desk' })).statusCode).toBe(200);
    expect((await admin('PATCH', `/api/users/${me}`, { role: 'desk' })).json()).toEqual({ error: 'lastAdmin' });
    expect((await admin('DELETE', `/api/users/${deskId}`)).statusCode).toBe(204);
    expect((await admin('GET', '/api/users')).json().users).toHaveLength(1);
  });
});
