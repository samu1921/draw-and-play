import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { ensureAdmin } from './bootstrap.js';
import { loadConfig } from './config.js';
import { DEMO_SLUG, seedDemo } from './demo/seed.js';
import { createDatabase, runMigrations } from './db/client.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

const app = await buildApp({
  logLevel: config.logLevel,
  webDist: config.webDist,
  pingDb: () => database.ping(),
  db: database.db,
  sessionTtlHours: config.sessionTtlHours,
});

try {
  const migrated = await runMigrations(database, migrationsFolder);
  app.log.info(migrated ? 'Migrations applied' : 'No migrations found');
  const admin = await ensureAdmin(database.db, config.adminUsername, config.adminPassword);
  if (admin === 'created') app.log.info(`Admin user "${config.adminUsername}" created`);
  if (config.demoSeed && (await seedDemo(database.db))) app.log.info(`Demo event "${DEMO_SLUG}" created`);
} catch (error) {
  app.log.error(error, 'Startup failed');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await database.close();
    process.exit(0);
  });
}

await app.listen({ host: config.host, port: config.port });
