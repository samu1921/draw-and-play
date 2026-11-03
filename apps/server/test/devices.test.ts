import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface OpsMatch {
  id: string;
  status: string;
  version: number;
  tableId: string | null;
  busy?: boolean;
  sides: ({ entryId: string; name: string; personIds: string[] } | null)[];
}

describe.skipIf(!databaseAvailable)('result entry by PIN and the operations view', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>['app'];
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let tableIds: string[];
  let pin: string;
  let deviceCookie: string;

  const operations = async () =>
    (await app.inject({ method: 'GET', url: '/api/events/pin-test/operations' })).json() as {
      tables: { id: string; name: string; match: OpsMatch | null }[];
      queue: OpsMatch[];
      recent: OpsMatch[];
    };
  const asDevice = (url: string, payload: object, cookie = deviceCookie) =>
    app.inject({ method: 'POST', url, payload, cookies: { dap_device: cookie } });

  beforeAll(async () => {
    ({ app } = await setupTestApp());
    api = await adminClient(app);
    eventId = (await api('POST', '/api/events', { name: 'PIN test', slug: 'pin-test', tableCount: 2 })).json().event.id;
    tableIds = (await app.inject({ method: 'GET', url: '/api/events/pin-test' })).json().tables.map((t: { id: string }) => t.id);
    const competitionId = (await api('POST', `/api/events/${eventId}/competitions`, { name: 'Hobby', format: { groups: { groupCount: 1 } } }))
      .json().competition.id;
    for (let i = 0; i < 4; i++) {
      const person = (await api('POST', `/api/events/${eventId}/persons`, { firstName: `P${i}`, lastName: 'Pin', club: 'TTC' })).json().person;
      await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [person.id] });
    }
    await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'pin' });
  });
  afterAll(async () => {
    await app.close();
    await closeTestDatabase();
  });

  it('refuses device sign-in while no PIN is set, and never exposes the PIN hash', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/events/pin-test/device', payload: { pin: '123456' } });
    expect(res.json()).toEqual({ error: 'pinDisabled' });
    const list = (await api('GET', '/api/events')).json().events[0];
    expect(list).not.toHaveProperty('pinHash');
    expect(list).toMatchObject({ pinEnabled: false });
  });

  it('signs a device in with the PIN', async () => {
    pin = (await api('POST', `/api/events/${eventId}/pin`)).json().pin;
    expect(pin).toMatch(/^\d{6}$/);
    const wrong = await app.inject({ method: 'POST', url: '/api/events/pin-test/device', payload: { pin: pin === '000000' ? '111111' : '000000' } });
    expect(wrong.json()).toEqual({ error: 'invalidPin' });

    const ok = await app.inject({ method: 'POST', url: '/api/events/pin-test/device', payload: { pin, label: 'Table 1' } });
    expect(ok.statusCode).toBe(200);
    deviceCookie = ok.cookies.find((c) => c.name === 'dap_device')!.value;
    const me = await app.inject({ method: 'GET', url: '/api/events/pin-test/device', cookies: { dap_device: deviceCookie } });
    expect(me.json()).toEqual({ device: { eventId, label: 'Table 1' } });
  });

  it('shows called matches per table and flags queued matches whose players are busy', async () => {
    const before = await operations();
    expect(before.queue).toHaveLength(6);
    const first = before.queue[0]!;
    await api('POST', `/api/matches/${first.id}/call`, { tableId: tableIds[0], version: first.version });

    const after = await operations();
    expect(after.tables[0]!.match).toMatchObject({ id: first.id, status: 'called' });
    expect(after.tables[0]!.match!.sides[0]!.name).toMatch(/^P\d Pin$/);
    expect(after.tables[1]!.match).toBeNull();
    const playing = new Set(first.sides.flatMap((s) => s!.personIds));
    for (const m of after.queue) {
      expect(m.busy).toBe(m.sides.some((s) => s!.personIds.some((p) => playing.has(p))));
    }
    expect(after.queue.some((m) => m.busy)).toBe(true);
    expect(after.queue.some((m) => !m.busy)).toBe(true);
  });

  it('lets a device enter the result of a called match, but nothing else', async () => {
    const ops = await operations();
    const waiting = ops.queue[0]!;
    const notCalled = await asDevice(`/api/matches/${waiting.id}/result`, { notation: '1 2 3', version: waiting.version });
    expect(notCalled.json()).toEqual({ error: 'notCalled' });

    const running = ops.tables[0]!.match!;
    const walkover = await asDevice(`/api/matches/${running.id}/result`, { walkoverWinner: 0, version: running.version });
    expect(walkover.statusCode).toBe(403);
    const ok = await asDevice(`/api/matches/${running.id}/result`, { notation: '4 -5 9 7', version: running.version });
    expect(ok.statusCode).toBe(200);

    const correction = await asDevice(`/api/matches/${running.id}/result`, { notation: '-4 -5 -9', version: ok.json().match.version });
    expect(correction.json()).toEqual({ error: 'correctionsAdminOnly' });
    expect((await operations()).recent[0]).toMatchObject({ id: running.id, status: 'finished' });
  });

  it('does not let devices call matches or change the setup', async () => {
    const waiting = (await operations()).queue[0]!;
    const call = await asDevice(`/api/matches/${waiting.id}/call`, { tableId: tableIds[1], version: waiting.version });
    expect(call.statusCode).toBe(401);
  });

  it('signs out every device when the PIN is rotated', async () => {
    await api('POST', `/api/events/${eventId}/pin`);
    const me = await app.inject({ method: 'GET', url: '/api/events/pin-test/device', cookies: { dap_device: deviceCookie } });
    expect(me.json()).toEqual({ device: null });
  });

  it('limits PIN attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/events/pin-test/device', payload: { pin: '999999' }, remoteAddress: '10.1.2.3' });
      statuses.push(res.statusCode);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
