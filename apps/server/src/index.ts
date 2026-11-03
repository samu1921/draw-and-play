import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase, runMigrations } from './db/client.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

const app = await buildApp({
  logLevel: config.logLevel,
  webDist: config.webDist,
  pingDb: () => database.ping(),
});

try {
  const migrated = await runMigrations(database, migrationsFolder);
  app.log.info(migrated ? 'Migrations applied' : 'No migrations found');
} catch (error) {
  app.log.error(error, 'Migrations failed');
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
