import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import { databaseEnv } from './env.ts';
import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

/**
 * Sem DATABASE_URL, o Forge roda em cima do PGlite — um Postgres real
 * compilado para WASM, embarcado no processo. Isso permite desenvolvimento
 * local com semântica de Postgres genuína sem exigir Docker instalado.
 * Quando DATABASE_URL estiver definido (ex.: docker-compose.yml na raiz),
 * o mesmo schema Drizzle passa a rodar contra um Postgres real via `pg`.
 */
export function createDatabase(): { db: Database; close: () => Promise<void> } {
  if (databaseEnv.DATABASE_URL) {
    const pool = new Pool({ connectionString: databaseEnv.DATABASE_URL });
    const db = drizzleNodePostgres(pool, { schema });
    return { db, close: () => pool.end() };
  }

  mkdirSync(dirname(databaseEnv.DATABASE_LOCAL_PATH), { recursive: true });
  const client = new PGlite(databaseEnv.DATABASE_LOCAL_PATH);
  const db = drizzlePglite(client, { schema });
  return { db, close: () => client.close() };
}

export { schema };
