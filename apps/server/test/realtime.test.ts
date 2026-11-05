import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

describe.skipIf(!databaseAvailable)('concurrency and live updates', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>['app'];
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let competitionId: string;
  let tableIds: string[];

  beforeAll(async () => {
    ({ app } = await setupTestApp());
    api = await adminClient(app);
    eventId = (await api('POST', '/api/events', { name: 'Live', slug: 'live', tableCount: 2 })).json().event.id;
    // Public views open to everybody; the viewer code has its own tests
    await api('DELETE', `/api/events/${eventId}/viewer-code`);
    tableIds = (await app.inject({ method: 'GET', url: '/api/events/live' })).json().tables.map((t: { id: string }) => t.id);
    competitionId = (await api('POST', `/api/events/${eventId}/competitions`, { name: 'Hobby', format: { groups: { groupCount: 1 } } })).json()
      .competition.id;
    for (let i = 0; i < 4; i++) {
      const person = (await api('POST', `/api/events/${eventId}/persons`, { firstName: `P${i}`, lastName: 'Live' })).json().person;
      await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [person.id] });
    }
    await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'live' });
  });
  afterAll(async () => {
    await app.close();
    await closeTestDatabase();
  });

  it('lets only one of two simultaneous calls take the same table', async () => {
    const { matches } = (await api('GET', `/api/competitions/${competitionId}/state`)).json() as {
      matches: { id: string; version: number; sides: string[]; status: string }[];
    };
    // Two matches of round 1 without a shared player
    const [a, b] = matches.filter((m) => m.status === 'ready').slice(0, 2);
    expect(a!.sides.some((s) => b!.sides.includes(s))).toBe(false);

    const results = await Promise.all(
      [a!, b!].map((m) => api('POST', `/api/matches/${m.id}/call`, { tableId: tableIds[0], version: m.version })),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json()).toMatchObject({ error: 'tableBusy' });
  });

  it('pushes a change message to stream subscribers', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const res = await fetch(`${address}/api/events/live/stream`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const readUntil = async (needle: string) => {
      while (!buffer.includes(needle)) buffer += decoder.decode((await reader.read()).value);
    };

    await readUntil('event: ready');
    await api('POST', `/api/events/${eventId}/persons`, { firstName: 'Late', lastName: 'Comer' });
    await readUntil('event: change');
    const data = JSON.parse(buffer.split('event: change\ndata: ')[1]!.split('\n')[0]!);
    expect(data).toMatchObject({ eventId, type: 'persons' });
    controller.abort();
  });
});
