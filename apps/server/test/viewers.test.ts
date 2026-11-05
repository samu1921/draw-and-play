import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { viewerExpiry } from '../src/auth/viewers.js';
import { adminClient, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

describe('viewerExpiry', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  it('lasts until the end of the day after the event, and at least one more day', () => {
    expect(viewerExpiry({ startsOn: '2026-11-06', endsOn: '2026-11-07' }, now).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(viewerExpiry({ startsOn: '2026-11-06', endsOn: null }, now).toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(viewerExpiry({ startsOn: null, endsOn: null }, now).toISOString()).toBe('2026-11-06T10:00:00.000Z');
    expect(viewerExpiry({ startsOn: '2026-01-01', endsOn: null }, now).toISOString()).toBe('2026-11-06T10:00:00.000Z');
  });
});

describe.skipIf(!databaseAvailable)('viewer code for the public views', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let eventId: string;
  let code: string;
  let competitionId: string;
  let profileId: string;

  /** All public reads of the event, as a browser with the given cookies */
  const reads = () => [
    '/api/events/geschuetzt',
    '/api/events/geschuetzt/operations',
    '/api/events/geschuetzt/forecast',
    '/api/events/geschuetzt/stream',
    `/api/competitions/${competitionId}/state`,
    `/api/displays/${profileId}`,
  ];
  const statuses = async (cookies: Record<string, string> = {}) =>
    Promise.all(
      reads().map(async (url) => {
        // The stream stays open when allowed; only its status line matters here
        if (url.endsWith('/stream')) {
          const res = await ctx.app.inject({ method: 'GET', url, cookies, payloadAsStream: true });
          (res.stream() as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
          return res.statusCode;
        }
        return (await ctx.app.inject({ method: 'GET', url, cookies })).statusCode;
      }),
    );
  const enter = (value: string, cookies: Record<string, string> = {}) =>
    ctx.app.inject({ method: 'POST', url: '/api/events/geschuetzt/viewer', payload: { code: value }, cookies });
  const viewerCookie = (res: Awaited<ReturnType<typeof enter>>) => res.cookies.find((c) => c.name === 'dap_viewer')!.value;

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    const created = (await api('POST', '/api/events', { name: 'Geschützt', slug: 'geschuetzt', startsOn: '2026-11-07' })).json().event;
    eventId = created.id;
    code = created.viewerCode;
    competitionId = (await api('POST', `/api/events/${eventId}/competitions`, { name: 'Einzel', format: { groups: { groupCount: 1 } } })).json().competition.id;
    profileId = (await api('POST', `/api/events/${eventId}/displays`, { name: 'Beamer' })).json().display.id;
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('protects new events with a six character code that only admins see', async () => {
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/events/geschuetzt' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'viewerCodeRequired', details: { name: 'Geschützt', pinEnabled: false, imprintUrl: null, privacyUrl: null } });
    expect(await statuses()).toEqual([401, 401, 401, 401, 401, 401]);
    expect((await api('GET', '/api/events/geschuetzt')).json().event).toMatchObject({ viewerProtected: true, viewerCode: code });
  });

  it('opens every public read once the code was entered, in any spelling', async () => {
    expect((await enter('WRONG1')).json()).toEqual({ error: 'invalidViewerCode' });
    const res = await enter(` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `);
    expect(res.statusCode).toBe(200);
    const cookie = viewerCookie(res);
    expect(await statuses({ dap_viewer: cookie })).toEqual([200, 200, 200, 200, 200, 200]);
    const overview = (await ctx.app.inject({ method: 'GET', url: '/api/events/geschuetzt', cookies: { dap_viewer: cookie } })).json();
    expect(overview.event.viewerProtected).toBe(true);
    expect(JSON.stringify(overview)).not.toContain(code);
  });

  it('lets result-entry devices read without the viewer code', async () => {
    const pin = (await api('POST', `/api/events/${eventId}/pin`)).json().pin;
    const device = await ctx.app.inject({ method: 'POST', url: '/api/events/geschuetzt/device', payload: { pin } });
    const token = device.cookies.find((c) => c.name === 'dap_device')!.value;
    expect((await ctx.app.inject({ method: 'GET', url: '/api/events/geschuetzt/operations', cookies: { dap_device: token } })).statusCode).toBe(200);
  });

  it('keeps the codes of several events in one cookie and signs everybody out with a new code', async () => {
    const other = (await api('POST', '/api/events', { name: 'Zweite', slug: 'zweite' })).json().event;
    const first = viewerCookie(await enter(code));
    const both = viewerCookie(
      await ctx.app.inject({ method: 'POST', url: '/api/events/zweite/viewer', payload: { code: other.viewerCode }, cookies: { dap_viewer: first } }),
    );
    expect(both.split('.')).toHaveLength(2);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/events/zweite', cookies: { dap_viewer: both } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/events/geschuetzt', cookies: { dap_viewer: both } })).statusCode).toBe(200);

    const rotated = (await api('POST', `/api/events/${eventId}/viewer-code`)).json().code;
    expect(rotated).not.toBe(code);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/events/geschuetzt', cookies: { dap_viewer: both } })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/events/zweite', cookies: { dap_viewer: both } })).statusCode).toBe(200);
    expect((await enter(code)).statusCode).toBe(401);
    code = rotated;
  });

  it('can be switched off, which opens the public views to everybody', async () => {
    expect((await api('DELETE', `/api/events/${eventId}/viewer-code`)).statusCode).toBe(204);
    expect(await statuses()).toEqual([200, 200, 200, 200, 200, 200]);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/events/geschuetzt' })).json().event.viewerProtected).toBe(false);
    expect((await enter('anything')).json()).toEqual({ ok: true });
  });

  it('only admins change the code', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: `/api/events/${eventId}/viewer-code` })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/events/${eventId}/viewer-code` })).statusCode).toBe(401);
  });
});
