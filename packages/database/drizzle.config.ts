import { defineConfig } from 'drizzle-kit';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDatabaseLocalPath = resolve(repoRoot, '.data', 'forge-dev.pglite');

/**
 * drizzle-kit carrega este arquivo de config via um loader CJS próprio que
 * não resolve imports relativos apontando para módulos `.ts` através da
 * extensão `.js` (convenção ESM usada no resto do pacote, ex.: `./src/env.js`).
 * Por isso a leitura de env é inlined aqui em vez de importar `./src/env.js`
 * — mantém a mesma validação/defaults de `src/env.ts`, só não compartilha o
 * módulo em runtime.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_LOCAL_PATH: z.string().default(defaultDatabaseLocalPath),
});

const databaseEnv = envSchema.parse({
  DATABASE_URL: process.env['DATABASE_URL'],
  DATABASE_LOCAL_PATH: process.env['DATABASE_LOCAL_PATH'],
});

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
