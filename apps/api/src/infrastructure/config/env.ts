import { z } from 'zod';

export const DEFAULT_DEVELOPMENT_JWT_SECRET = 'dev-insecure-secret-change-me';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  AI_PROVIDER: z.enum(['mock', 'gemini', 'groq', 'anthropic']).optional(),
  AI_MODEL: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Segredo de assinatura dos JWTs de sessão (Fase 2 — Auth/RBAC). O
   * default só existe para não bloquear `pnpm dev`/testes locais sem
   * configuração extra — é claramente inseguro e NUNCA deve ser usado em
   * produção. Mesma filosofia das Fases 0/1: nenhuma credencial externa é
   * obrigatória para rodar o projeto localmente.
   */
  JWT_SECRET: z.string().min(1).default(DEFAULT_DEVELOPMENT_JWT_SECRET),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validação de infraestrutura real. Em development/test, o projeto continua
 * sem fricção usando PGlite, fila em memória e JWT default; em produção, esses
 * fallbacks deixam de ser aceitáveis e o processo falha cedo.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.parse(source);

  if (parsed.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!parsed.DATABASE_URL) missing.push('DATABASE_URL');
    if (!parsed.REDIS_URL) missing.push('REDIS_URL');
    if (parsed.JWT_SECRET === DEFAULT_DEVELOPMENT_JWT_SECRET) missing.push('JWT_SECRET');

    if (missing.length > 0) {
      throw new Error(`Configuração de produção incompleta: defina ${missing.join(', ')}.`);
    }
  }

  return parsed;
}

/**
 * Validado uma única vez na inicialização do processo. Falhar cedo aqui evita
 * que configuração inválida se propague para dentro dos módulos.
 */
export const env: Env = parseEnv();
