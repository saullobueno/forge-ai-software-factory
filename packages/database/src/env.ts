import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const DEFAULT_DATABASE_LOCAL_PATH = resolve(repoRoot, '.data', 'forge-dev.pglite');

const envSchema = z.object({
  /**
   * Quando ausente, o Forge usa PGlite (Postgres embarcado, sem Docker) com
   * persistência em disco local — ver DATABASE_LOCAL_PATH. Defina DATABASE_URL
   * para apontar para um Postgres real (ex.: via docker-compose.yml na raiz).
   */
  DATABASE_URL: z.string().url().optional(),
  DATABASE_LOCAL_PATH: z.string().default(DEFAULT_DATABASE_LOCAL_PATH),
});

export const databaseEnv = envSchema.parse({
  DATABASE_URL: process.env['DATABASE_URL'],
  DATABASE_LOCAL_PATH: process.env['DATABASE_LOCAL_PATH'],
});
