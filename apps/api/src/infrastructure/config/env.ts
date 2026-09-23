import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Segredo de assinatura dos JWTs de sessão (Fase 2 — Auth/RBAC). O
   * default só existe para não bloquear `pnpm dev`/testes locais sem
   * configuração extra — é claramente inseguro e NUNCA deve ser usado em
   * produção. Mesma filosofia das Fases 0/1: nenhuma credencial externa é
   * obrigatória para rodar o projeto localmente.
   */
  JWT_SECRET: z.string().min(1).default('dev-insecure-secret-change-me'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validado uma única vez na inicialização do processo. Falhar cedo aqui
 * evita que configuração inválida se propague para dentro dos módulos.
 */
export const env: Env = envSchema.parse(process.env);
