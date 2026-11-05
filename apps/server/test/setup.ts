import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { ensureAdmin } from '../src/bootstrap.js';
import { createDatabase, runMigrations, type Database } from '../src/db/client.js';
import { Broadcaster } from '../src/realtime/broadcaster.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationsFolder = path.resolve(root, 'apps/server/drizzle');

export const ADMIN = { username: 'admin', password: 'correct horse battery staple' };

/** TEST_DATABASE_URL, or DATABASE_URL from the environment / repo .env with "_test" appended to the database name */
function testDatabaseUrl(): string | null {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const envFile = path.join(root, '.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.DATABASE_URL) return null;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  return url.toString();
}

async function ensureDatabase(url: string): Promise<boolean> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString(), connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    const exists = await client.query('select 1 from pg_database where datname = $1', [name]);
    if (exists.rowCount === 0) await client.query(`create database "${name.replace(/"/g, '')}"`);
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const url = testDatabaseUrl();
export const databaseAvailable = url !== null && (await ensureDatabase(url));
if (!databaseAvailable) {
  console.warn('[server tests] No PostgreSQL reachable: integration tests are skipped. Start it with `docker compose up -d db`.');
}

let database: Database | undefined;

/** Fresh schema contents for every test file: migrate once, then truncate everything. */
export async function setupTestApp(options: Partial<Parameters<typeof buildApp>[0]> = {}) {
  database ??= createDatabase(url!);
  await runMigrations(database, migrationsFolder);
  await database.db.execute(sql`
    truncate table audit_log, device_sessions, matches, entry_members, entries, competitions, persons, event_tables, events, sessions, users restart identity cascade
  `);
  await ensureAdmin(database.db, ADMIN.username, ADMIN.password);
  const broadcaster = new Broadcaster();
  const app = await buildApp({ pingDb: () => database!.ping(), db: database.db, broadcaster, ...options });
  return { app, db: database.db, broadcaster };
}

export async function closeTestDatabase() {
  await database?.close();
  database = undefined;
}

type App = Awaited<ReturnType<typeof setupTestApp>>['app'];

/** Logs in as admin and returns a helper that sends JSON requests with the session cookie. */
export async function adminClient(app: App) {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: ADMIN });
  if (login.statusCode !== 200) throw new Error(`login failed: ${login.body}`);
  const cookie = login.cookies.find((c) => c.name === 'dap_session')!;
  return (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, ...(payload !== undefined && { payload: payload as object }), cookies: { dap_session: cookie.value } });
}
