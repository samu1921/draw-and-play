import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, ADMIN, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

// Smallest valid PNG (1×1 pixel)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/eL9GtQAAAABJRU5ErkJggg==',
  'base64',
);

describe.skipIf(!databaseAvailable)('branding and images', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let api: Awaited<ReturnType<typeof adminClient>>;
  let cookie: string;
  let eventId: string;

  const upload = (data: Buffer, query: string, contentType = 'image/png') =>
    ctx.app.inject({ method: 'POST', url: `/api/assets?${query}`, payload: data, headers: { 'content-type': contentType }, cookies: { dap_session: cookie } });

  beforeAll(async () => {
    ctx = await setupTestApp();
    api = await adminClient(ctx.app);
    const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: ADMIN });
    cookie = login.cookies.find((c) => c.name === 'dap_session')!.value;
    eventId = (await api('POST', '/api/events', { name: 'Hallenturnier', slug: 'halle' })).json().event.id;
  });
  afterAll(async () => {
    await ctx.app.close();
    await closeTestDatabase();
  });

  it('stores an uploaded image and serves it publicly with a long cache', async () => {
    const res = await upload(PNG, 'kind=logo');
    expect(res.statusCode).toBe(201);
    const served = await ctx.app.inject({ method: 'GET', url: `/api/assets/${res.json().id}` });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(served.rawPayload.equals(PNG)).toBe(true);
  });

  it('refuses SVG and files that are not what they claim, and uploads without sign-in', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(svg, 'kind=logo', 'image/svg+xml')).statusCode).toBe(415);
    expect((await upload(svg, 'kind=logo', 'image/png')).json().error).toBe('notAnImage');
    const anonymous = await ctx.app.inject({ method: 'POST', url: '/api/assets?kind=logo', payload: PNG, headers: { 'content-type': 'image/png' } });
    expect(anonymous.statusCode).toBe(401);
  });

  it('saves the installation look and offers it with the config', async () => {
    const logoId = (await upload(PNG, 'kind=logo')).json().id;
    const res = await api('PUT', '/api/branding', { name: 'TTC Musterstadt', accent: '#B01E2D', logoId, displayDim: 60 });
    expect(res.statusCode).toBe(200);
    const config = (await ctx.app.inject({ method: 'GET', url: '/api/config' })).json();
    expect(config.branding).toEqual({ name: 'TTC Musterstadt', accent: '#b01e2d', logoId, displayDim: 60 });
  });

  it('checks colours and that images exist, have the right kind and belong to the same scope', async () => {
    expect((await api('PUT', '/api/branding', { accent: 'red' })).statusCode).toBe(400);
    const logoId = (await upload(PNG, 'kind=logo')).json().id;
    // A logo is not a display background
    expect((await api('PUT', '/api/branding', { displayBackgroundId: logoId })).json().error).toBe('unknownImage');
    // An installation image cannot be the event's own
    const own = await api('PATCH', `/api/events/${eventId}`, { settings: { branding: { logoId } } });
    expect(own.json().error).toBe('unknownImage');
  });

  it('lets an event use its own images and carries them through export and import', async () => {
    const backgroundId = (await upload(PNG, `kind=displayBackground&eventId=${eventId}`)).json().id;
    const patch = await api('PATCH', `/api/events/${eventId}`, { settings: { branding: { accent: '#0a7d3b', displayBackgroundId: backgroundId } } });
    expect(patch.statusCode).toBe(200);

    const doc = (await api('GET', `/api/events/${eventId}/export`)).json();
    expect(doc.assets).toEqual([{ id: backgroundId, kind: 'displayBackground', data: PNG.toString('base64') }]);

    const imported = (await api('POST', '/api/events/import', doc)).json().event;
    const newBackground = imported.settings.branding.displayBackgroundId;
    expect(newBackground).not.toBe(backgroundId);
    expect(imported.settings.branding.accent).toBe('#0a7d3b');
    const served = await ctx.app.inject({ method: 'GET', url: `/api/assets/${newBackground}` });
    expect(served.rawPayload.equals(PNG)).toBe(true);
  });

  it('drops a reference to an image that is missing from an imported file', async () => {
    const doc = (await api('GET', `/api/events/${eventId}/export`)).json();
    const imported = (await api('POST', '/api/events/import', { ...doc, assets: [] })).json().event;
    expect(imported.settings.branding.displayBackgroundId).toBeNull();
  });

  it('saves a certificate template for the installation and lets an event bring its own with a background', async () => {
    const lines = { title: 'Ehrenurkunde', place: '{platz}. Platz', text: 'im Wettbewerb {konkurrenz}' };
    const res = await api('PUT', '/api/certificate', { mode: 'designed', showLogo: true, lines, signatures: ['Turnierleitung'] });
    expect(res.statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/config' })).json().certificate).toMatchObject({ lines, signatures: ['Turnierleitung'] });

    // A logo is not a certificate background
    const logoId = (await upload(PNG, `kind=logo&eventId=${eventId}`)).json().id;
    expect((await api('PATCH', `/api/events/${eventId}`, { settings: { certificate: { backgroundId: logoId } } })).json().error).toBe('unknownImage');

    const backgroundId = (await upload(PNG, `kind=certificateBackground&eventId=${eventId}`)).json().id;
    const patch = await api('PATCH', `/api/events/${eventId}`, { settings: { certificate: { mode: 'textOnly', backgroundId } } });
    expect(patch.statusCode).toBe(200);
    const doc = (await api('GET', `/api/events/${eventId}/export`)).json();
    const imported = (await api('POST', '/api/events/import', doc)).json().event;
    expect(imported.settings.certificate.mode).toBe('textOnly');
    expect(imported.settings.certificate.backgroundId).not.toBe(backgroundId);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/assets/${imported.settings.certificate.backgroundId}` })).statusCode).toBe(200);

    // Back to the installation's template
    expect((await api('PATCH', `/api/events/${eventId}`, { settings: { certificate: null } })).json().event.settings.certificate).toBeNull();
  });
});
