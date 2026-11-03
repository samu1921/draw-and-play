import { existsSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle; accepted wherever a query only needs to read or write */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

export interface Database {
  db: Db;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabase(databaseUrl: string): Database {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db,
    async ping() {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}

/** Applies all migrations from `migrationsFolder`. Does nothing while there are no migrations yet. */
export async function runMigrations(database: Database, migrationsFolder: string): Promise<boolean> {
  if (!existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))) {
    return false;
  }
  await migrate(database.db, { migrationsFolder });
  return true;
}
