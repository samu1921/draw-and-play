import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

interface PersonView {
  id: string;
  name: string;
  firstName: string;
  lastName: string | null;
  club: string | null;
  gender: string | null;
  birthYear: number | null;
  licenceNo: string | null;
  rating: number | null;
}

describe.skipIf(!databaseAvailable)('person import', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let singles: string;
  let doubles: string;
  let drawn: string;

  const persons = async () => (await api('GET', `/api/events/${eventId}/persons`)).json().persons as PersonView[];
  const entries = async (competitionId: string) =>
    (await api('GET', `/api/competitions/${competitionId}/state`)).json().entries as { status: string; members: { name: string }[] }[];
  const importRows = (rows: unknown[], status?: string) => api('POST', `/api/events/${eventId}/persons/import`, { rows, ...(status && { status }) });

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Import', slug: 'import' })).json().event.id;
    const create = async (name: string, kind: string) =>
      (await api('POST', `/api/events/${eventId}/competitions`, { name, kind, format: { knockout: { placements: 'none' } } })).json().competition.id as string;
    singles = await create('Einzel', 'singles');
    doubles = await create('Doppel', 'doubles');
    drawn = await create('Schon gelost', 'singles');
    for (const name of ['X', 'Y']) {
      const id = (await api('POST', `/api/events/${eventId}/persons`, { firstName: name })).json().person.id;
      await api('POST', `/api/competitions/${drawn}/entries`, { personIds: [id] });
    }
    await api('POST', `/api/competitions/${drawn}/draw`, {});
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('creates persons with all their data and enters them right away', async () => {
    const res = await importRows(
      [
        { firstName: 'Anna', lastName: 'Berger', club: 'TTC', gender: 'f', birthYear: 2001, licenceNo: 'L-1', rating: 1720, competitionIds: [singles, doubles] },
        { firstName: 'Gast', competitionIds: [doubles] },
        { firstName: 'Ben', lastName: 'Krüger', competitionIds: [] },
      ],
      'present',
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: 3, updated: 0, entered: 3, skipped: [] });

    const anna = (await persons()).find((p) => p.firstName === 'Anna')!;
    expect(anna).toMatchObject({ lastName: 'Berger', club: 'TTC', gender: 'f', birthYear: 2001, licenceNo: 'L-1', rating: 1720 });
    expect((await entries(singles)).map((e) => [e.members.map((m) => m.name).join('/'), e.status])).toEqual([['Anna Berger', 'present']]);
    // Doubles: single players waiting for the pair draw
    expect((await entries(doubles)).map((e) => e.members.map((m) => m.name))).toEqual([['Anna Berger'], ['Gast']]);
  });

  it('updates existing persons without touching columns that were not imported, and skips existing entries', async () => {
    const anna = (await persons()).find((p) => p.firstName === 'Anna')!;
    const res = await importRows([{ updateId: anna.id, firstName: 'Anna', rating: 1750, competitionIds: [singles] }]);
    expect(res.json()).toEqual({ created: 0, updated: 1, entered: 0, skipped: [{ row: 0, competitionId: singles, reason: 'alreadyEntered' }] });
    expect((await persons()).find((p) => p.id === anna.id)).toMatchObject({ rating: 1750, club: 'TTC', lastName: 'Berger', licenceNo: 'L-1' });
  });

  it('skips competitions that are drawn already', async () => {
    const res = await importRows([{ firstName: 'Spät', competitionIds: [drawn, singles] }]);
    expect(res.json()).toMatchObject({ created: 1, entered: 1, skipped: [{ row: 0, competitionId: drawn, reason: 'alreadyDrawn' }] });
  });

  it('rejects unknown references and writes nothing then', async () => {
    const before = (await persons()).length;
    const unknownCompetition = await importRows([
      { firstName: 'Neu', competitionIds: [] },
      { firstName: 'Neu2', competitionIds: ['00000000-0000-4000-8000-000000000000'] },
    ]);
    expect(unknownCompetition.json()).toMatchObject({ error: 'unknownCompetition', details: { row: 1 } });
    const unknownPerson = await importRows([{ firstName: 'Neu', updateId: '00000000-0000-4000-8000-000000000000' }]);
    expect(unknownPerson.json()).toMatchObject({ error: 'unknownPerson', details: { row: 0 } });
    const invalid = await importRows([{ firstName: '', competitionIds: [] }]);
    expect(invalid.json()).toMatchObject({ error: 'validation' });
    expect(await importRows([])).toMatchObject({ statusCode: 400 });
    expect((await persons()).length).toBe(before);
  });

  it('needs an admin', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: `/api/events/${eventId}/persons/import`, payload: { rows: [{ firstName: 'A' }] } });
    expect(res.statusCode).toBe(401);
  });
});
