import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validado uma única vez na inicialização do processo. Falhar cedo aqui
 * evita que configuração inválida se propague para dentro dos módulos.
 */
export const env: Env = envSchema.parse(process.env);
