import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/schema.js';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface MatchView {
  id: string;
  key: string;
  phase: 'group' | 'knockout';
  status: 'pending' | 'ready' | 'called' | 'finished';
  sides: [string | null, string | null];
  tableId: string | null;
  version: number;
  places: [number, number] | null;
}

describe.skipIf(!databaseAvailable)('tournament flow via the API', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>['app'];
  let db: Awaited<ReturnType<typeof setupTestApp>>['db'];
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let tables: { id: string; name: string }[];
  let competitionId: string;
  const personIds: string[] = [];

  const state = async (asPublic = false) => {
    const res = asPublic
      ? await app.inject({ method: 'GET', url: `/api/competitions/${competitionId}/state` })
      : await api('GET', `/api/competitions/${competitionId}/state`);
    expect(res.statusCode).toBe(200);
    return res.json() as { matches: MatchView[]; groups: { complete: boolean; standings: { entryId: string }[]; tieBreaks: { entries: string[] }[] }[]; placements: { entryId: string; place: number }[]; finished: boolean; entries: { id: string; members: Record<string, unknown>[] }[] };
  };
  const finish = (m: MatchView, notation = '5 5 5') => api('POST', `/api/matches/${m.id}/result`, { notation, version: m.version });

  beforeAll(async () => {
    ({ app, db } = await setupTestApp());
    api = await adminClient(app);
  });
  afterAll(async () => {
    await app.close();
    await closeTestDatabase();
  });

  it('sets up an event with tables, persons and a competition', async () => {
    const created = await api('POST', '/api/events', { name: 'Vereinsmeisterschaft 2026', slug: 'vm-2026', tableCount: 4 });
    expect(created.statusCode).toBe(201);
    eventId = created.json().event.id;
    // Public views open to everybody; the viewer code has its own tests
    await api('DELETE', `/api/events/${eventId}/viewer-code`);

    const overview = await app.inject({ method: 'GET', url: '/api/events/vm-2026' });
    expect(overview.statusCode).toBe(200);
    tables = overview.json().tables;
    expect(tables.map((t) => t.name)).toEqual(['1', '2', '3', '4']);

    for (let i = 0; i < 8; i++) {
      const res = await api('POST', `/api/events/${eventId}/persons`, {
        firstName: `Player${i + 1}`,
        lastName: `Test`,
        club: i % 2 === 0 ? 'TTC' : 'SV',
        rating: 1800 - i * 50,
        birthYear: 1990,
      });
      expect(res.statusCode).toBe(201);
      personIds.push(res.json().person.id);
    }

    const competition = await api('POST', `/api/events/${eventId}/competitions`, {
      name: 'Einzel',
      format: { groups: { groupCount: 2 }, knockout: { qualifiersPerGroup: 2, placements: 'thirdPlace' } },
    });
    expect(competition.statusCode).toBe(201);
    competitionId = competition.json().competition.id;
    expect(competition.json().competition).toMatchObject({ matchMinutes: 30, matchRules: { gamesToWin: 3 }, drawn: false });

    for (const personId of personIds) {
      expect((await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [personId] })).statusCode).toBe(201);
    }
    const duplicate = await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [personIds[0]] });
    expect(duplicate.json()).toMatchObject({ error: 'alreadyEntered' });
  });

  it('stores the sport of an event, table tennis by default', async () => {
    const overview = await app.inject({ method: 'GET', url: '/api/events/vm-2026' });
    expect(overview.json().event.sport).toBe('table-tennis');

    const explicit = await api('POST', '/api/events', { name: 'Explicit', sport: 'table-tennis' });
    expect(explicit.json().event.sport).toBe('table-tennis');
    const unknown = await api('POST', '/api/events', { name: 'Chess', sport: 'chess' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ error: 'validation' });
    expect((await api('DELETE', `/api/events/${explicit.json().event.id}`)).statusCode).toBe(204);
  });

  it('draws reproducibly with a seed and locks the field', async () => {
    const first = await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'vm' });
    expect(first.statusCode).toBe(200);
    expect((await api('DELETE', `/api/competitions/${competitionId}/draw`)).statusCode).toBe(204);
    const second = await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'vm' });
    expect(second.json().draw).toEqual(first.json().draw);

    const again = await api('POST', `/api/competitions/${competitionId}/draw`, {});
    expect(again.json()).toEqual({ error: 'alreadyDrawn' });
    const lateEntry = await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [personIds[0]] });
    expect(lateEntry.json()).toEqual({ error: 'alreadyDrawn' });

    const s = await state();
    expect(s.groups).toHaveLength(2);
    expect(s.matches.filter((m) => m.phase === 'group')).toHaveLength(12);
    expect(s.matches.filter((m) => m.phase === 'knockout')).toHaveLength(4);
    expect(s.matches.filter((m) => m.status === 'ready')).toHaveLength(12);

    // Open knockout sides say where they come from: semifinal 1 is winner A vs runner-up B
    const semi = (s.matches as unknown as { phase: string; places: number[] | null; sources: unknown[] }[]).find(
      (m) => m.phase === 'knockout' && m.places?.[1] === 4,
    )!;
    expect(semi.sources).toEqual([
      { type: 'qualifier', group: 0, rank: 1 },
      { type: 'qualifier', group: 1, rank: 2 },
    ]);
  });

  it('shows public views without personal data', async () => {
    const publicState = await state(true);
    const member = publicState.entries[0]!.members[0]!;
    expect(Object.keys(member).sort()).toEqual(['club', 'id', 'name']);
    const adminState = await state();
    expect(adminState.entries[0]!.members[0]).toHaveProperty('rating');
  });

  it('calls matches onto tables and prevents double bookings', async () => {
    const s = await state();
    const [m1, m2] = s.matches.filter((m) => m.status === 'ready');
    const call = await api('POST', `/api/matches/${m1!.id}/call`, { tableId: tables[0]!.id, version: m1!.version });
    expect(call.statusCode).toBe(200);

    // Same table again
    const busyTable = await api('POST', `/api/matches/${m2!.id}/call`, { tableId: tables[0]!.id, version: m2!.version });
    expect(busyTable.json()).toMatchObject({ error: 'tableBusy' });

    // Stale version
    const stale = await api('POST', `/api/matches/${m1!.id}/uncall`, { version: m1!.version });
    expect(stale.json()).toMatchObject({ error: 'versionConflict' });

    // A match sharing a player with the called one
    const after = await state();
    const called = after.matches.find((m) => m.id === m1!.id)!;
    expect(called).toMatchObject({ status: 'called', tableId: tables[0]!.id });
    const clash = after.matches.find(
      (m) => m.status === 'ready' && m.sides.some((side) => called.sides.includes(side)),
    )!;
    const busyPlayer = await api('POST', `/api/matches/${clash.id}/call`, { tableId: tables[1]!.id, version: clash.version });
    expect(busyPlayer.json()).toMatchObject({ error: 'playerBusy' });
  });

  it('records results in short notation and frees the table', async () => {
    const called = (await state()).matches.find((m) => m.status === 'called')!;
    const invalid = await finish(called, '4 -5');
    expect(invalid.json()).toMatchObject({ error: 'incompleteResult' });
    const wrong = await finish(called, 'abc');
    expect(wrong.json()).toMatchObject({ error: 'invalidResult', details: { code: 'invalidToken' } });

    const ok = await finish(called, '4 -5 9 7');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().match).toMatchObject({ status: 'finished', tableId: null, result: { winner: 0 } });
  });

  it('fills the knockout from the group standings and blocks corrections that would break it', async () => {
    for (let s = await state(); s.matches.some((m) => m.phase === 'group' && m.status !== 'finished'); s = await state()) {
      for (const m of s.matches.filter((x) => x.phase === 'group' && x.status === 'ready')) {
        expect((await finish(m)).statusCode).toBe(200);
      }
    }
    const s = await state();
    expect(s.groups.every((g) => g.complete)).toBe(true);
    // Every tie in a table is explained, and the explained order is the order of the table
    for (const g of s.groups) {
      const order = g.standings.map((r) => r.entryId);
      for (const tie of g.tieBreaks) {
        const start = order.indexOf(tie.entries[0]!);
        expect(order.slice(start, start + tie.entries.length)).toEqual(tie.entries);
      }
    }
    const semis = s.matches.filter((m) => m.phase === 'knockout' && m.places?.[0] === 1 && m.places[1] === 4);
    expect(semis).toHaveLength(2);
    expect(semis.every((m) => m.status === 'ready' && m.sides.every((side) => side !== null))).toBe(true);
    // Cross-over: the winner of group A meets the runner-up of group B
    expect(semis[0]!.sides).toEqual([s.groups[0]!.standings[0]!.entryId, s.groups[1]!.standings[1]!.entryId]);

    // Correcting a group result is fine while the knockout has not started …
    const groupMatch = s.matches.find((m) => m.phase === 'group')!;
    expect((await finish(groupMatch, '5 5 5')).statusCode).toBe(200);
    // … but not once a semifinal is under way.
    const semi = (await state()).matches.find((m) => m.id === semis[0]!.id)!;
    expect((await api('POST', `/api/matches/${semi.id}/call`, { tableId: tables[2]!.id, version: semi.version })).statusCode).toBe(200);
    const refreshed = (await state()).matches.find((m) => m.id === groupMatch.id)!;
    const blocked = await finish(refreshed, '-5 -5 -5');
    expect(blocked.json()).toMatchObject({ error: 'dependentMatchStarted' });
  });

  it('plays the knockout to the end and reports places', async () => {
    for (let s = await state(); !s.finished; s = await state()) {
      for (const m of s.matches.filter((x) => x.status === 'ready' || x.status === 'called')) {
        expect((await finish(m)).statusCode).toBe(200);
      }
    }
    const s = await state();
    expect(s.placements.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 5, 7, 7]);

    const undo = await api('DELETE', `/api/competitions/${competitionId}/draw`);
    expect(undo.json()).toEqual({ error: 'matchesStarted' });
  });

  it('refuses to delete an entered person, but deletes a whole event with everything in it', async () => {
    const blocked = await api('DELETE', `/api/persons/${personIds[0]}`);
    expect(blocked.json()).toEqual({ error: 'personHasEntries' });

    const other = (await api('POST', '/api/events', { name: 'Throwaway', slug: 'throwaway' })).json().event.id;
    const person = (await api('POST', `/api/events/${other}/persons`, { firstName: 'Tmp', lastName: 'Tmp' })).json().person.id;
    const comp = (await api('POST', `/api/events/${other}/competitions`, { name: 'X', format: { groups: { groupCount: 1 } } })).json().competition.id;
    await api('POST', `/api/competitions/${comp}/entries`, { personIds: [person] });
    expect((await api('DELETE', `/api/events/${other}`)).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/events/throwaway' })).statusCode).toBe(404);
  });

  it('writes every command to the audit log', async () => {
    const actions = new Set((await db.select({ action: auditLog.action }).from(auditLog)).map((r) => r.action));
    expect([...actions].sort()).toEqual(['call', 'correctResult', 'create', 'draw', 'openPublicViews', 'result', 'undoDraw']);
  });
});
