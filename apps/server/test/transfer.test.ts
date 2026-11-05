import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SLUG, seedDemo } from '../src/demo/seed.js';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Doc {
  event: { slug: string; name: string };
  tables: { id: string; name: string }[];
  persons: { id: string; firstName: string; lastName: string | null }[];
  competitions: { id: string; name: string; startAfterId: string | null; draw: unknown }[];
  entries: { id: string; competitionId: string; members: string[] }[];
  matches: { competitionId: string; matchKey: string; status: string }[];
  displayProfiles: { name: string; settings: { competitionIds?: string[] | null } }[];
  [key: string]: unknown;
}

/** Replaces every id by a readable label and sorts the lists, so two exports of the same event compare equal. */
function normalize(doc: Doc) {
  const labels = new Map<string, string>();
  for (const t of doc.tables) labels.set(t.id, `table:${t.name}`);
  for (const p of doc.persons) labels.set(p.id, `person:${p.firstName} ${p.lastName}`);
  for (const c of doc.competitions) labels.set(c.id, `competition:${c.name}`);
  for (const e of doc.entries) labels.set(e.id, `entry:${labels.get(e.competitionId)}:${e.members.map((m) => labels.get(m)).join('/')}`);
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string' && UUID.test(value)) return labels.get(value) ?? 'unknown-id';
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
    return value;
  };
  const sorted = (list: unknown[]) => list.map(replace).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const { slug: _slug, ...event } = doc.event;
  return {
    event,
    tables: sorted(doc.tables),
    persons: sorted(doc.persons),
    competitions: sorted(doc.competitions),
    entries: sorted(doc.entries),
    matches: sorted(doc.matches),
    displayProfiles: sorted(doc.displayProfiles),
  };
}

/** Competition state with ids replaced by member names and table names */
function normalizeState(state: Record<string, unknown> & { entries: { id: string; members: { id: string; name: string }[] }[]; matches: { id: string; key: string }[] }, tables: { id: string; name: string }[]) {
  const labels = new Map<string, string>();
  for (const t of tables) labels.set(t.id, `table:${t.name}`);
  for (const e of state.entries) {
    labels.set(e.id, `entry:${e.members.map((m) => m.name).join('/')}`);
    for (const m of e.members) labels.set(m.id, `person:${m.name}`);
  }
  for (const m of state.matches) labels.set(m.id, `match:${m.key}`);
  const replace = (value: unknown, key?: string): unknown => {
    if (key === 'version' || key === 'competitionId' || key === 'id' && typeof value === 'string' && !labels.has(value)) return 'ignored';
    if (typeof value === 'string' && UUID.test(value)) return labels.get(value) ?? 'unknown-id';
    if (Array.isArray(value)) return value.map((v) => replace(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v, k)]));
    return value;
  };
  return replace(state);
}

describe.skipIf(!databaseAvailable)('event export and import', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let original: Doc;

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    await seedDemo(ctx.db, new Date(2026, 10, 3));
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  const overview = async (ref: string) => (await ctx.app.inject({ method: 'GET', url: `/api/events/${ref}` })).json();
  const competitionState = async (id: string) => {
    const res = await api('GET', `/api/competitions/${id}/state`);
    expect(res.statusCode).toBe(200);
    return res.json();
  };

  it('needs an admin', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/events/${DEMO_SLUG}/export` });
    expect(res.statusCode).toBe(401);
    const imported = await ctx.app.inject({ method: 'POST', url: '/api/events/import', payload: {} });
    expect(imported.statusCode).toBe(401);
  });

  it('exports an event in the middle of play', async () => {
    const { competitions, tables } = await overview(DEMO_SLUG);
    const doubles = competitions.find((c: { name: string }) => c.name === 'Doppel');
    const singles = competitions.find((c: { name: string }) => c.name === 'Einzel Aktive');
    for (const c of [doubles, singles]) expect((await api('POST', `/api/competitions/${c.id}/draw`, { seed: 'export' })).statusCode).toBe(200);

    // Finish two doubles matches (one as a walkover), call a third one onto a table
    const ready = (await competitionState(doubles.id)).matches.filter((m: { status: string }) => m.status === 'ready');
    expect((await api('POST', `/api/matches/${ready[0].id}/result`, { notation: '5 -7 9 11', version: ready[0].version })).statusCode).toBe(200);
    expect((await api('POST', `/api/matches/${ready[1].id}/result`, { walkoverWinner: 1, version: ready[1].version })).statusCode).toBe(200);
    expect((await api('POST', `/api/matches/${ready[2].id}/call`, { tableId: tables[2].id, version: ready[2].version })).statusCode).toBe(200);

    // A guest with a first name only
    expect((await api('POST', `/api/events/${(await overview(DEMO_SLUG)).event.id}/persons`, { firstName: 'Gast' })).statusCode).toBe(201);

    const profile = await api('POST', `/api/events/${(await overview(DEMO_SLUG)).event.id}/displays`, { name: 'Only singles', settings: { competitionIds: [singles.id] } });
    expect(profile.statusCode).toBe(201);

    const res = await api('GET', `/api/events/${DEMO_SLUG}/export`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(new RegExp(`^attachment; filename="${DEMO_SLUG}-\\d{4}-\\d{2}-\\d{2}\\.json"$`));
    original = res.json();
    expect(original).toMatchObject({ format: 'draw-and-play-event', formatVersion: 1 });
    expect(original.matches.filter((m) => m.status !== 'scheduled').map((m) => m.status).sort()).toEqual(['called', 'finished', 'finished']);
    // Secrets and accounts stay behind
    expect(JSON.stringify(original)).not.toMatch(/pinHash|pin_hash|argon2|passwordHash|createdBy/);
  });

  it('imports it as a new event with the same state', async () => {
    const res = await api('POST', '/api/events/import', original);
    expect(res.statusCode).toBe(201);
    const imported = res.json().event;
    expect(imported.slug).not.toBe(DEMO_SLUG);
    expect(imported.slug.startsWith(`${DEMO_SLUG}-`)).toBe(true);
    expect(imported).toMatchObject({ name: original.event.name, pinEnabled: false });

    const again: Doc = (await api('GET', `/api/events/${imported.id}/export`)).json();
    expect(again.tables.every((t) => !original.tables.some((o) => o.id === t.id))).toBe(true);
    expect(normalize(again)).toEqual(normalize(original));

    // Same standings, brackets and table assignments as the original
    const before = await overview(DEMO_SLUG);
    const after = await overview(imported.slug);
    for (const c of before.competitions as { id: string; name: string; drawn: boolean }[]) {
      const twin = after.competitions.find((x: { name: string }) => x.name === c.name);
      expect(twin, c.name).toBeDefined();
      if (!c.drawn) continue;
      expect(normalizeState(await competitionState(twin.id), after.tables), c.name).toEqual(normalizeState(await competitionState(c.id), before.tables));
    }
    const singles = after.competitions.find((c: { name: string }) => c.name === 'Einzel Aktive');
    const doubles = after.competitions.find((c: { name: string }) => c.name === 'Doppel');
    expect(singles.startAfterId).toBe(doubles.id);

    // The imported event is fully operational: the called match can be finished there
    const called = (await competitionState(doubles.id)).matches.find((m: { status: string }) => m.status === 'called');
    expect((await api('POST', `/api/matches/${called.id}/result`, { notation: '3 3 3', version: called.version })).statusCode).toBe(200);
  });

  it('rejects files that are not an export', async () => {
    const foreign = await api('POST', '/api/events/import', { hello: 'world' });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json()).toMatchObject({ error: 'unsupportedFormat' });

    const future = await api('POST', '/api/events/import', { ...original, formatVersion: 99 });
    expect(future.json()).toMatchObject({ error: 'unsupportedFormat', details: { formatVersion: 99 } });

    const unknownSport = await api('POST', '/api/events/import', { ...original, event: { ...original.event, sport: 'chess' } });
    expect(unknownSport.json()).toMatchObject({ error: 'validation' });

    const broken = await api('POST', '/api/events/import', { ...original, tables: 'nope' });
    expect(broken.json()).toMatchObject({ error: 'validation' });
  });

  it('rejects documents whose parts do not fit together', async () => {
    const tamper = (change: (doc: Doc) => void) => {
      const doc = structuredClone(original);
      change(doc);
      return api('POST', '/api/events/import', doc);
    };
    const reason = async (change: (doc: Doc) => void) => (await tamper(change)).json().details?.reason;

    expect(await reason((d) => (d.entries[0]!.members = ['00000000-0000-4000-8000-000000000000']))).toBe('unknownReference');
    expect(await reason((d) => d.persons.push({ ...d.persons[0]! }))).toBe('duplicateId');
    expect(await reason((d) => (d.matches[0]!.matchKey = 'XX-1'))).toBe('unknownMatch');
    expect(
      await reason((d) => {
        const drawn = d.competitions.find((c) => c.draw !== null)!;
        drawn.draw = { type: 'knockout', seats: [] };
      }),
    ).toBe('invalidDraw');
    expect(await reason((d) => (d.displayProfiles[0]!.settings.competitionIds = ['00000000-0000-4000-8000-000000000000']))).toBe('unknownReference');

    // Nothing of the failed imports was written
    const events = (await api('GET', '/api/events')).json().events;
    expect(events).toHaveLength(2);
  });
});
