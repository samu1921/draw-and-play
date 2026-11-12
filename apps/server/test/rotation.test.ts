import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface MatchView {
  id: string;
  key: string;
  phase: string;
  round: number;
  status: string;
  version: number;
  sides: [string | null, string | null];
  partners: [string | null, string | null] | null;
  withdrawal?: boolean;
}
interface StateView {
  matches: MatchView[];
  groups: { standings: { entryId: string; played: number; won: number; withdrawn?: boolean }[]; complete: boolean }[];
  entries: { id: string; members: { id: string }[] }[];
  placements: { entryId: string; place: number }[];
  finished: boolean;
}

const players = (m: MatchView) => [...m.sides, ...(m.partners ?? [])];

describe.skipIf(!databaseAvailable)('doubles with rotating partners via the API', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let competitionId: string;
  let tables: { id: string }[];
  const personIds: string[] = [];

  const state = async () => (await api('GET', `/api/competitions/${competitionId}/state`)).json() as StateView;
  const finish = (m: MatchView, notation: string) => api('POST', `/api/matches/${m.id}/result`, { notation, version: m.version });

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Wechseldoppel', slug: 'wechseldoppel', tableCount: 3 })).json().event.id;
    tables = (await api('GET', '/api/events/wechseldoppel')).json().tables;
    for (let i = 0; i < 9; i++) {
      personIds.push((await api('POST', `/api/events/${eventId}/persons`, { firstName: `R${i + 1}`, lastName: 'Test' })).json().person.id);
    }
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('only takes the rotation format, and the rotation format only for this kind', async () => {
    const wrongFormat = await api('POST', `/api/events/${eventId}/competitions`, { name: 'X', kind: 'rotation', format: { groups: { groupCount: 1 } } });
    expect(wrongFormat.json()).toEqual({ error: 'formatKindMismatch' });
    const wrongKind = await api('POST', `/api/events/${eventId}/competitions`, { name: 'X', kind: 'singles', format: { rotation: {} } });
    expect(wrongKind.json()).toEqual({ error: 'formatKindMismatch' });

    const created = await api('POST', `/api/events/${eventId}/competitions`, { name: 'Wechseldoppel', kind: 'rotation', format: { rotation: {} } });
    expect(created.statusCode).toBe(201);
    competitionId = created.json().competition.id;
    expect(created.json().competition).toMatchObject({ kind: 'rotation', format: { rotation: {} } });
  });

  it('takes single players only', async () => {
    const pair = await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: personIds.slice(0, 2) });
    expect(pair.json()).toMatchObject({ error: 'wrongMemberCount' });
    for (const id of personIds.slice(0, 8)) {
      expect((await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [id], status: 'present' })).statusCode).toBe(201);
    }
  });

  it('draws the schedule: everybody plays seven matches, each with another partner', async () => {
    expect((await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'rotation' })).statusCode).toBe(200);
    const s = await state();
    expect(s.matches).toHaveLength(14);
    expect(s.matches.every((m) => m.phase === 'rotation' && m.status === 'ready' && m.partners !== null)).toBe(true);
    const ids = s.entries.map((e) => e.id);
    for (const id of ids) expect(s.matches.filter((m) => players(m).includes(id))).toHaveLength(7);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]!.standings).toHaveLength(8);
  });

  it('calls a match with all four players and keeps them off other tables', async () => {
    const s = await state();
    const [first] = s.matches;
    const call = await api('POST', `/api/matches/${first!.id}/call`, { tableId: tables[0]!.id, version: first!.version });
    expect(call.statusCode).toBe(200);
    expect(call.json().match).toMatchObject({ sideA: first!.sides[0], partnerA: first!.partners![0], partnerB: first!.partners![1] });
    // A match where only a partner of the called match plays
    const partner = first!.partners![1]!;
    const clash = s.matches.find((m) => m.id !== first!.id && players(m).includes(partner))!;
    const busy = await api('POST', `/api/matches/${clash.id}/call`, { tableId: tables[1]!.id, version: clash.version });
    expect(busy.json()).toMatchObject({ error: 'playerBusy' });

    const operations = (await api('GET', `/api/events/${eventId}/operations`)).json();
    const onTable = operations.tables[0].match;
    expect(onTable.sides[0].name).toMatch(/^R\d Test \/ R\d Test$/);
    expect(onTable.sides[0].personIds).toHaveLength(2);

    expect((await api('GET', `/api/events/${eventId}/forecast`)).statusCode).toBe(200);
  });

  it('credits a result to both players of a side', async () => {
    const called = (await state()).matches.find((m) => m.status === 'called')!;
    expect((await finish(called, '5 5 5')).statusCode).toBe(200);
    const rows = (await state()).groups[0]!.standings;
    const row = (id: string | null) => rows.find((r) => r.entryId === id)!;
    expect(row(called.sides[0])).toMatchObject({ played: 1, won: 1 });
    expect(row(called.partners![0])).toMatchObject({ played: 1, won: 1 });
    expect(row(called.sides[1])).toMatchObject({ played: 1, won: 0 });
    expect(row(called.partners![1])).toMatchObject({ played: 1, won: 0 });
  });

  it('annuls the matches of a withdrawn player for everybody and can take it back', async () => {
    const before = await state();
    const leaving = before.entries[7]!.id;
    const withdraw = await api('POST', `/api/entries/${leaving}/withdraw`, {});
    expect(withdraw.statusCode).toBe(200);
    const after = await state();
    const own = after.matches.filter((m) => players(m).includes(leaving));
    expect(own.every((m) => m.status === 'finished')).toBe(true);
    expect(withdraw.json().walkovers).toBe(own.filter((m) => before.matches.find((b) => b.key === m.key)!.status !== 'finished').length);
    expect(after.groups[0]!.standings.at(-1)).toMatchObject({ entryId: leaving, withdrawn: true });
    expect((await api('POST', `/api/entries/${leaving}/reinstate`, {})).statusCode).toBe(204);
  });

  it('ranks the single players once everything is played', async () => {
    for (let s = await state(); !s.finished; s = await state()) {
      for (const m of s.matches.filter((x) => x.status === 'ready')) expect((await finish(m, '5 5 5')).statusCode).toBe(200);
    }
    const s = await state();
    expect(s.groups[0]!.complete).toBe(true);
    expect(s.groups[0]!.standings.every((r) => r.played === 7)).toBe(true);
    expect(s.placements.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.placements[0]!.entryId).toBe(s.groups[0]!.standings[0]!.entryId);
  });

  it('keeps the draw and the partners through export and import', async () => {
    const doc = (await api('GET', `/api/events/${eventId}/export`)).json();
    expect(doc.competitions[0].draw.type).toBe('rotation');
    expect(doc.matches.every((m: { partnerA?: string }) => typeof m.partnerA === 'string')).toBe(true);
    const imported = await api('POST', '/api/events/import', { ...doc, event: { ...doc.event, slug: 'wechseldoppel-kopie' } });
    expect(imported.statusCode).toBe(201);
    const copy = (await api('GET', `/api/events/${imported.json().event.id}/export`)).json();
    expect(copy.matches).toHaveLength(14);
    expect(copy.matches.every((m: { partnerA?: string }) => typeof m.partnerA === 'string')).toBe(true);
  });
});
