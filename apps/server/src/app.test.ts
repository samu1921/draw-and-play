import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('reports ok when the database is reachable', async () => {
    const app = await buildApp({ pingDb: async () => true });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('reports 503 when the database is unreachable', async () => {
    const app = await buildApp({ pingDb: async () => false });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', db: 'unreachable' });
  });
});

describe('SPA serving', () => {
  const webDist = mkdtempSync(path.join(tmpdir(), 'dap-web-'));
  writeFileSync(path.join(webDist, 'index.html'), '<!doctype html><title>draw-and-play</title>');

  it('serves index.html for client routes', async () => {
    const app = await buildApp({ pingDb: async () => true, webDist });
    const res = await app.inject({ method: 'GET', url: '/planner/variants' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('draw-and-play');
  });

  it('returns 404 instead of index.html for unknown API routes', async () => {
    const app = await buildApp({ pingDb: async () => true, webDist });
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
