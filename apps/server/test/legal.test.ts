import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

const defaults = { imprintUrl: 'https://verein.example/impressum', privacyUrl: 'https://verein.example/datenschutz' };

describe.skipIf(!databaseAvailable)('legal links and the audit log', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;

  const overview = async () => (await api('GET', '/api/events/recht')).json().event;

  beforeAll(async () => {
    ctx = await setupTestApp({ legal: defaults });
    api = await adminClient(ctx.app);
    eventId = (await api('POST', '/api/events', { name: 'Recht', slug: 'recht' })).json().event.id;
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('offers the installation defaults to every page', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json()).toEqual({ legal: defaults, branding: {}, certificate: {} });
    expect((await overview()).legal).toEqual({ ...defaults, privacyNote: null });
  });

  it('lets each event set its own links and a note, and falls back when they are cleared', async () => {
    const patch = (settings: object) => api('PATCH', `/api/events/${eventId}`, { settings });
    expect((await patch({ imprintUrl: 'https://ttc.example/impressum', privacyNote: 'Namen und Ergebnisse werden veröffentlicht.' })).statusCode).toBe(200);
    expect((await overview()).legal).toEqual({
      imprintUrl: 'https://ttc.example/impressum',
      privacyUrl: defaults.privacyUrl,
      privacyNote: 'Namen und Ergebnisse werden veröffentlicht.',
    });
    // Even the locked page links to the event's legal notice
    const locked = await ctx.app.inject({ method: 'GET', url: '/api/events/recht' });
    expect(locked.json().details).toMatchObject({ imprintUrl: 'https://ttc.example/impressum', privacyUrl: null });

    expect((await patch({ imprintUrl: 'javascript:alert(1)' })).json()).toMatchObject({ error: 'validation' });
    expect((await patch({ privacyUrl: 'not a url' })).json()).toMatchObject({ error: 'validation' });
    expect((await patch({ imprintUrl: '', privacyNote: '  ' })).statusCode).toBe(200);
    expect((await overview()).legal).toEqual({ ...defaults, privacyNote: null });
  });

  it('lists the audit log newest first, with names for users and devices, page by page', async () => {
    const pin = (await api('POST', `/api/events/${eventId}/pin`)).json().pin;
    await ctx.app.inject({ method: 'POST', url: '/api/events/recht/device', payload: { pin, label: 'Tisch 1' } });
    await api('POST', `/api/events/${eventId}/viewer-code`);

    const first = (await api('GET', `/api/events/${eventId}/audit?limit=2`)).json();
    expect(first.entries.map((e: { action: string }) => e.action)).toEqual(['rotateViewerCode', 'rotatePin']);
    expect(first.entries[0].actor).toEqual({ type: 'user', name: 'admin' });
    expect(first.next).toBe(first.entries[1].id);
    const second = (await api('GET', `/api/events/${eventId}/audit?limit=2&before=${first.next}`)).json();
    expect(second.entries.map((e: { action: string }) => e.action)).toEqual(['create']);
    expect(second.next).toBeNull();

    expect((await ctx.app.inject({ method: 'GET', url: `/api/events/${eventId}/audit` })).statusCode).toBe(401);
  });
});
