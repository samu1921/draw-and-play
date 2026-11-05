import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface MatchView {
  id: string;
  key: string;
  round: number;
  places: [number, number] | null;
  status: string;
  sides: [string | null, string | null];
  result: { winner: number; walkover?: boolean } | null;
  version: number;
}

describe.skipIf(!databaseAvailable)('withdrawal after the draw', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let competitionId: string;
  let tableId: string;
  let withdrawing: string;

  const state = async () =>
    (await api('GET', `/api/competitions/${competitionId}/state`)).json() as { matches: MatchView[]; entries: { id: string; status: string }[] };
  const matchesOf = async (entryId: string) => (await state()).matches.filter((m) => m.sides.includes(entryId));

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    const eventId = (await api('POST', '/api/events', { name: 'Rückzug', slug: 'rueckzug', tableCount: 2 })).json().event.id;
    // Public views open to everybody; the viewer code has its own tests
    await api('DELETE', `/api/events/${eventId}/viewer-code`);
    tableId = (await ctx.app.inject({ method: 'GET', url: '/api/events/rueckzug' })).json().tables[0].id;
    competitionId = (await api('POST', `/api/events/${eventId}/competitions`, { name: 'KO', format: { knockout: { placements: 'thirdPlace' } } })).json()
      .competition.id;
    for (let i = 0; i < 4; i++) {
      const person = (await api('POST', `/api/events/${eventId}/persons`, { firstName: `S${i + 1}`, rating: 1800 - i * 100 })).json().person;
      await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [person.id] });
    }
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('is only possible after the draw (before, the entry is simply set to withdrawn)', async () => {
    const entryId = (await state()).entries[0]!.id;
    expect((await api('POST', `/api/entries/${entryId}/withdraw`)).json()).toEqual({ error: 'notDrawn' });
    expect((await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'w' })).statusCode).toBe(200);
  });

  it('needs the match on the table to be taken back first', async () => {
    const semi = (await state()).matches.find((m) => m.status === 'ready')!;
    withdrawing = semi.sides[0]!;
    expect((await api('POST', `/api/matches/${semi.id}/call`, { tableId, version: semi.version })).statusCode).toBe(200);
    expect((await api('POST', `/api/entries/${withdrawing}/withdraw`)).json()).toMatchObject({ error: 'matchCalled' });
    const called = (await state()).matches.find((m) => m.id === semi.id)!;
    expect((await api('POST', `/api/matches/${semi.id}/uncall`, { version: called.version })).statusCode).toBe(200);
  });

  it('turns the remaining matches into walkovers and can be taken back', async () => {
    const res = await api('POST', `/api/entries/${withdrawing}/withdraw`);
    expect(res.json()).toEqual({ walkovers: 1 });
    expect((await api('POST', `/api/entries/${withdrawing}/withdraw`)).json()).toEqual({ error: 'alreadyWithdrawn' });

    const [semi] = await matchesOf(withdrawing);
    expect(semi).toMatchObject({ status: 'finished', result: { walkover: true } });
    expect(semi!.sides[semi!.result!.winner]).not.toBe(withdrawing);
    const ops = (await ctx.app.inject({ method: 'GET', url: '/api/events/rueckzug/operations' })).json();
    expect(ops.queue.map((m: { id: string }) => m.id)).not.toContain(semi!.id);

    expect((await api('POST', `/api/entries/${withdrawing}/reinstate`)).statusCode).toBe(204);
    expect((await matchesOf(withdrawing))[0]).toMatchObject({ status: 'ready', result: null });
    expect((await state()).entries.find((e) => e.id === withdrawing)!.status).toBe('present');
  });

  it('also gives the match for third place away, and cannot be taken back once later matches started', async () => {
    await api('POST', `/api/entries/${withdrawing}/withdraw`);
    const otherSemi = (await state()).matches.find((m) => m.round === 1 && m.status === 'ready')!;
    expect((await api('POST', `/api/matches/${otherSemi.id}/result`, { notation: '5 5 5', version: otherSemi.version })).statusCode).toBe(200);

    const after = await state();
    const third = after.matches.find((m) => m.places?.[0] === 3)!;
    expect(third).toMatchObject({ status: 'finished', result: { walkover: true } });
    expect(third.sides).toContain(withdrawing);
    const final = after.matches.find((m) => m.places?.[0] === 1 && m.places[1] === 2)!;
    expect(final.status).toBe('ready');
    expect(final.sides).not.toContain(withdrawing);

    expect((await api('POST', `/api/matches/${final.id}/call`, { tableId, version: final.version })).statusCode).toBe(200);
    expect((await api('POST', `/api/entries/${withdrawing}/reinstate`)).json()).toMatchObject({ error: 'dependentMatchStarted' });
  });

  it('needs an admin', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: `/api/entries/${withdrawing}/reinstate` })).statusCode).toBe(401);
  });
});
