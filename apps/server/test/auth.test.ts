import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, closeTestDatabase, databaseAvailable, setupTestApp } from './setup.js';

describe.skipIf(!databaseAvailable)('authentication', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>['app'];

  beforeAll(async () => {
    ({ app } = await setupTestApp());
  });
  afterAll(async () => {
    await app.close();
    await closeTestDatabase();
  });

  it('logs in with a session cookie that is http-only and same-site', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: ADMIN });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { username: 'admin' } });
    const cookie = res.cookies.find((c) => c.name === 'dap_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { dap_session: cookie.value } });
    expect(me.json()).toMatchObject({ user: { username: 'admin' } });

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { dap_session: cookie.value } });
    expect(logout.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { dap_session: cookie.value } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects wrong credentials without revealing whether the user exists', async () => {
    const wrongPassword = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { ...ADMIN, password: 'nope' } });
    const unknownUser = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ghost', password: 'nope' } });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownUser.json());
  });

  it('protects admin routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: { name: 'Club championship' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'notLoggedIn' });
  });

  it('rejects state-changing requests that are not JSON (CSRF protection)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'username=admin&password=x',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual({ error: 'jsonRequired' });
  });

  it('rate-limits login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'x', password: 'y' }, remoteAddress: '10.9.9.9' });
      statuses.push(res.statusCode);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
