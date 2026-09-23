import { z } from 'zod';

const envSchema = z.object({
  /**
   * Quando ausente, o Forge usa PGlite (Postgres embarcado, sem Docker) com
   * persistência em disco local — ver DATABASE_LOCAL_PATH. Defina DATABASE_URL
   * para apontar para um Postgres real (ex.: via docker-compose.yml na raiz).
   */
  DATABASE_URL: z.string().url().optional(),
  DATABASE_LOCAL_PATH: z.string().default('./.data/forge-dev.pglite'),
});

export const databaseEnv = envSchema.parse({
  DATABASE_URL: process.env['DATABASE_URL'],
  DATABASE_LOCAL_PATH: process.env['DATABASE_LOCAL_PATH'],
});
