import { defineConfig } from 'drizzle-kit';
import { databaseEnv } from './src/env.js';

/**
 * Sem DATABASE_URL, o drizzle-kit gera/aplica migrações direto no arquivo
 * local do PGlite (driver "pglite"). Com DATABASE_URL definido, aponta para
 * um Postgres real (ex.: docker-compose.yml na raiz).
 */
export default defineConfig(
  databaseEnv.DATABASE_URL
    ? {
        dialect: 'postgresql',
        schema: './src/schema/index.ts',
        out: './drizzle',
        dbCredentials: { url: databaseEnv.DATABASE_URL },
      }
    : {
        dialect: 'postgresql',
        driver: 'pglite',
        schema: './src/schema/index.ts',
        out: './drizzle',
        dbCredentials: { url: databaseEnv.DATABASE_LOCAL_PATH },
      },
);
