import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface MatchView {
  id: string;
  key: string;
  phase: string;
  round: number;
  stage: string | null;
  places: [number, number] | null;
  status: string;
  sides: [string | null, string | null];
  sources: { type: string; rank?: number; advancing?: boolean }[] | null;
  version: number;
}
interface StateView {
  competition: { version: number };
  entries: { id: string; status: string; members: { name: string }[] }[];
  groups: { group: number; complete: boolean; standings: { entryId: string; rank: number; won: number; lost: number; buchholz?: number; withdrawn?: boolean }[] }[];
  matches: MatchView[];
  nextRanked: { rank: number; advancing: number; complete: boolean; rows: { group: number; row: { entryId: string } }[] } | null;
  seeding: { rank: number; advancing: number; complete: boolean; rows: { group: number; row: { entryId: string } }[] }[];
  placementGroups: { stage: string; places: [number, number]; entries: string[]; complete: boolean; standings: { entryId: string; won: number }[] }[];
  swiss: { rounds: number; paired: { round: number; bye: string | null }[] } | null;
  placements: { entryId: string; place: number; placeTo: number }[];
  finished: boolean;
}

describe.skipIf(!databaseAvailable)('Swiss system, best thirds and consolation brackets', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;

  const stateOf = async (competitionId: string) => (await api('GET', `/api/competitions/${competitionId}/state`)).json() as StateView;

  async function createCompetition(name: string, format: unknown, entryCount: number) {
    const res = await api('POST', `/api/events/${eventId}/competitions`, { name, format });
    expect(res.statusCode).toBe(201);
    const competitionId = res.json().competition.id as string;
    for (let i = 0; i < entryCount; i++) {
      const person = (await api('POST', `/api/events/${eventId}/persons`, { firstName: `${name}${String(i + 1).padStart(2, '0')}`, rating: 2000 - i * 20 })).json().person;
      await api('POST', `/api/competitions/${competitionId}/entries`, { personIds: [person.id] });
    }
    return competitionId;
  }

  /** Records a result for every ready match until nothing is left; the first side wins. Returns the rounds played. */
  async function playAll(competitionId: string, only?: (m: MatchView) => boolean) {
    for (let guard = 0; guard < 50; guard++) {
      const ready = (await stateOf(competitionId)).matches.filter((m) => m.status === 'ready' && (only?.(m) ?? true));
      if (ready.length === 0) return;
      for (const m of ready) {
        const res = await api('POST', `/api/matches/${m.id}/result`, { notation: '5 5 5', version: m.version });
        expect(res.statusCode).toBe(200);
      }
    }
  }

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Modi', slug: 'modi', tableCount: 4 })).json().event.id;
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('rejects formats that make no sense', async () => {
    const both = await api('POST', `/api/events/${eventId}/competitions`, { name: 'X', format: { groups: { groupCount: 2 }, swiss: { rounds: 3 } } });
    expect(both.statusCode).toBe(400);
    const noQualifiers = await api('POST', `/api/events/${eventId}/competitions`, { name: 'X', format: { swiss: { rounds: 3 }, knockout: { placements: 'none' } } });
    expect(noQualifiers.statusCode).toBe(400);
  });

  it('pairs a Swiss round as soon as the one before is finished', async () => {
    const competitionId = await createCompetition('Swiss', { swiss: { rounds: 3 } }, 7);
    expect((await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 's' })).statusCode).toBe(200);

    let state = await stateOf(competitionId);
    expect(state.swiss).toMatchObject({ rounds: 3, paired: [{ round: 1 }] });
    expect(state.swiss!.paired[0]!.bye).not.toBeNull();
    expect(state.matches.filter((m) => m.round === 1).map((m) => m.status)).toEqual(['ready', 'ready', 'ready']);
    expect(state.matches.filter((m) => m.round === 2).every((m) => m.status === 'pending' && m.sides[0] === null)).toBe(true);
    // The bye already counts as a win
    expect(state.groups[0]!.standings.find((r) => r.entryId === state.swiss!.paired[0]!.bye)).toMatchObject({ won: 1 });

    const [first, ...rest] = state.matches.filter((m) => m.round === 1);
    await api('POST', `/api/matches/${first!.id}/result`, { notation: '5 5 5', version: first!.version });
    expect((await stateOf(competitionId)).swiss!.paired).toHaveLength(1);
    for (const m of rest) await api('POST', `/api/matches/${m.id}/result`, { notation: '5 5 5', version: m.version });

    state = await stateOf(competitionId);
    expect(state.swiss!.paired).toHaveLength(2);
    expect(state.matches.filter((m) => m.round === 2).map((m) => m.status)).toEqual(['ready', 'ready', 'ready']);
    expect(state.swiss!.paired[1]!.bye).not.toBe(state.swiss!.paired[0]!.bye);
  });

  it('pairs a round again after a correction, until one of its matches has started', async () => {
    const competitionId = (await api('GET', `/api/events/modi`)).json().competitions.find((c: { name: string }) => c.name === 'Swiss').id as string;
    const before = await stateOf(competitionId);
    const corrected = before.matches.find((m) => m.round === 1)!;
    expect((await api('POST', `/api/matches/${corrected.id}/result`, { notation: '-5 -5 -5', version: corrected.version })).statusCode).toBe(200);
    const after = await stateOf(competitionId);
    expect(after.matches.filter((m) => m.round === 2).map((m) => m.sides)).not.toEqual(before.matches.filter((m) => m.round === 2).map((m) => m.sides));

    // Once a match of round 2 is played, round 1 can no longer be corrected
    const second = after.matches.find((m) => m.round === 2)!;
    await api('POST', `/api/matches/${second.id}/result`, { notation: '5 5 5', version: second.version });
    const again = (await stateOf(competitionId)).matches.find((m) => m.id === corrected.id)!;
    expect((await api('POST', `/api/matches/${corrected.id}/result`, { notation: '5 5 5', version: again.version })).json()).toMatchObject({ error: 'dependentMatchStarted' });
  });

  it('leaves a withdrawn entry out of the next round but keeps it in the table', async () => {
    const competitionId = (await api('GET', `/api/events/modi`)).json().competitions.find((c: { name: string }) => c.name === 'Swiss').id as string;
    await playAll(competitionId, (m) => m.round === 2);
    let state = await stateOf(competitionId);
    expect(state.swiss!.paired).toHaveLength(3);
    const leaving = state.matches.find((m) => m.round === 3)!.sides[0]!;
    expect((await api('POST', `/api/entries/${leaving}/withdraw`)).statusCode).toBe(200);

    // Round 3 has not started: it is paired again without the entry, so nobody gets a walkover
    state = await stateOf(competitionId);
    const third = state.matches.filter((m) => m.round === 3);
    expect(third.flatMap((m) => m.sides)).not.toContain(leaving);
    expect(third).toHaveLength(3);
    expect(state.swiss!.paired[2]!.bye).toBeNull();

    await playAll(competitionId);
    state = await stateOf(competitionId);
    expect(state.finished).toBe(true);
    expect(state.groups[0]!.complete).toBe(true);
    expect(state.groups[0]!.standings.find((r) => r.entryId === leaving)).toMatchObject({ withdrawn: true, lost: expect.any(Number) });
    expect(state.groups[0]!.standings.every((r) => r.won + r.lost === 3 && r.buchholz !== undefined)).toBe(true);
    expect(state.placements.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('lets the two best thirds fill the bracket and the others play on', async () => {
    const format = { groups: { groupCount: 3 }, knockout: { qualifiersPerGroup: 2, placements: 'all', fillByes: true, consolation: 'bracket' } };
    const competitionId = await createCompetition('Fill', format, 12);
    expect((await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'f' })).statusCode).toBe(200);

    let state = await stateOf(competitionId);
    expect(state.nextRanked).toMatchObject({ rank: 3, advancing: 2, complete: false });
    const firstRound = state.matches.filter((m) => m.stage === 'KO' && m.round === 1);
    expect(firstRound).toHaveLength(4);
    expect(firstRound.flatMap((m) => m.sources!).filter((s) => s.type === 'bestNext')).toEqual([
      { type: 'bestNext', rank: 3, advancing: true, index: expect.any(Number) },
      { type: 'bestNext', rank: 3, advancing: true, index: expect.any(Number) },
    ]);

    await playAll(competitionId, (m) => m.phase === 'group');
    state = await stateOf(competitionId);
    expect(state.nextRanked!.complete).toBe(true);
    const thirds = state.nextRanked!.rows.map((r) => r.row.entryId);
    const inMain = state.matches.filter((m) => m.stage === 'KO' && m.round === 1).flatMap((m) => m.sides);
    expect(inMain).toHaveLength(8);
    expect(inMain).toEqual(expect.arrayContaining(thirds.slice(0, 2)));
    expect(inMain).not.toContain(thirds[2]);
    // The remaining third and the three fourths meet in the consolation bracket for places 9–12
    const consolation = state.matches.filter((m) => m.stage === 'C1' && m.round === 1);
    expect(consolation.map((m) => m.places)).toEqual([[9, 12], [9, 12]]);
    expect(consolation.flatMap((m) => m.sides)).toContain(thirds[2]);

    await playAll(competitionId);
    state = await stateOf(competitionId);
    expect(state.finished).toBe(true);
    expect(state.placements.map((p) => [p.place, p.placeTo])).toEqual(Array.from({ length: 12 }, (_, i) => [i + 1, i + 1]));
  });

  it('plays fields of three everybody against everybody', async () => {
    const format = { groups: { groupCount: 3 }, knockout: { qualifiersPerGroup: 2, placements: 'all', consolation: 'perRank' } };
    const competitionId = await createCompetition('Three', format, 12);
    expect((await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 't' })).statusCode).toBe(200);

    let state = await stateOf(competitionId);
    expect(state.placementGroups.map((g) => [g.stage, g.places, g.entries.length])).toEqual([['C1', [7, 9], 0], ['C2', [10, 12], 0]]);
    const field = state.matches.filter((m) => m.stage === 'C1');
    expect(field.map((m) => [m.phase, m.places, m.status])).toEqual(Array.from({ length: 3 }, () => ['placement', [7, 9], 'pending']));
    expect(field[0]!.sources!.map((s) => [s.type, s.rank])).toEqual([['qualifier', 3], ['qualifier', 3]]);

    await playAll(competitionId, (m) => m.phase === 'group');
    state = await stateOf(competitionId);
    expect(state.placementGroups[0]!.entries).toHaveLength(3);
    expect(state.matches.filter((m) => m.phase === 'placement' && m.status === 'ready')).toHaveLength(6);

    await playAll(competitionId);
    state = await stateOf(competitionId);
    expect(state.finished).toBe(true);
    expect(state.placementGroups.every((g) => g.complete)).toBe(true);
    expect(state.placements.map((p) => [p.place, p.placeTo])).toEqual(Array.from({ length: 12 }, (_, i) => [i + 1, i + 1]));
    expect(state.placements.slice(6, 9).map((p) => p.entryId)).toEqual(state.placementGroups[0]!.standings.map((r) => r.entryId));
  });

  it('gives the byes of a consolation bracket to the best of a group rank', async () => {
    const format = { groups: { groupCount: 3 }, knockout: { qualifiersPerGroup: 2, placements: 'all', consolation: 'bracket' } };
    const competitionId = await createCompetition('Byes', format, 12);
    expect((await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'b' })).statusCode).toBe(200);

    let state = await stateOf(competitionId);
    expect(state.nextRanked).toBeNull();
    expect(state.seeding.map((c) => [c.rank, c.advancing, c.complete])).toEqual([[3, 0, false], [4, 0, false]]);
    const open = state.matches.filter((m) => m.stage === 'C1' && m.round === 1).flatMap((m) => m.sources!);
    expect(open.every((s) => s.type === 'bestNext' && s.advancing === false)).toBe(true);

    await playAll(competitionId, (m) => m.phase === 'group');
    state = await stateOf(competitionId);
    const thirds = state.seeding[0]!.rows.map((r) => r.row.entryId);
    const firstRound = state.matches.filter((m) => m.stage === 'C1' && m.round === 1).flatMap((m) => m.sides);
    expect(firstRound).toHaveLength(4);
    expect(firstRound).not.toContain(thirds[0]);
    expect(firstRound).not.toContain(thirds[1]);
    expect(firstRound).toContain(thirds[2]);

    await playAll(competitionId);
    expect((await stateOf(competitionId)).finished).toBe(true);
  });

  it('exports and imports a running Swiss competition', async () => {
    const competitionId = await createCompetition('Export', { swiss: { rounds: 3 }, knockout: { qualifiersPerGroup: 4, placements: 'none' } }, 8);
    await api('POST', `/api/competitions/${competitionId}/draw`, { seed: 'e' });
    await playAll(competitionId, (m) => m.round === 1 && m.phase === 'swiss');
    const exported = await api('GET', `/api/events/${eventId}/export`);
    expect(exported.statusCode).toBe(200);
    const imported = await api('POST', '/api/events/import', exported.json());
    expect(imported.statusCode).toBe(201);
    const copy = (await api('GET', `/api/events/${imported.json().event.slug}`)).json().competitions.find((c: { name: string }) => c.name === 'Export');
    const state = await stateOf(copy.id);
    expect(state.swiss!.paired).toHaveLength(2);
    expect(state.matches.filter((m) => m.round === 2 && m.phase === 'swiss').every((m) => m.status === 'ready')).toBe(true);
  });
});
