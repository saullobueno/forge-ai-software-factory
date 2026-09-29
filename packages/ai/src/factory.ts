import { HttpAiProvider, type HttpTransport } from './http-provider.ts';
import { MockAiProvider } from './mock-provider.ts';
import type { AiProvider } from './types.ts';

/**
 * Fábrica de provedor de IA (Fase 7/13, spec §17/§21). Sem `AI_PROVIDER`
 * explícito — o caso padrão de um checkout local deste portfólio — usa
 * `MockAiProvider` (determinístico, sem rede, spec §21 "Modo Demo").
 * Providers reais ficam atrás da mesma interface `AiProvider`; o
 * orquestrador (`@forge/agents`) continua sem depender de implementação.
 */
export interface AiProviderEnv {
  AI_PROVIDER?: string | undefined;
  AI_MODEL?: string | undefined;
  AI_REQUEST_TIMEOUT_MS?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  GROQ_API_KEY?: string | undefined;
  GROQ_MODEL?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
}

export interface CreateAiProviderOptions {
  transport?: HttpTransport;
}

export function createAiProvider(
  env: AiProviderEnv = process.env,
  options: CreateAiProviderOptions = {},
): AiProvider {
  const provider = (env.AI_PROVIDER ?? 'mock').trim().toLowerCase();
  if (provider === '' || provider === 'mock') return new MockAiProvider();

  const timeoutMs = parseTimeoutMs(env.AI_REQUEST_TIMEOUT_MS);
  const sharedOptions = {
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(options.transport === undefined ? {} : { transport: options.transport }),
  };
  if (provider === 'groq') {
    return new HttpAiProvider({
      provider: 'groq',
      apiKey: requireEnv(env.GROQ_API_KEY, 'GROQ_API_KEY'),
      model: requireEnv(env.GROQ_MODEL ?? env.AI_MODEL, 'GROQ_MODEL ou AI_MODEL'),
      ...sharedOptions,
    });
  }

  if (provider === 'gemini') {
    return new HttpAiProvider({
      provider: 'gemini',
      apiKey: requireEnv(env.GEMINI_API_KEY, 'GEMINI_API_KEY'),
      model: requireEnv(env.GEMINI_MODEL ?? env.AI_MODEL, 'GEMINI_MODEL ou AI_MODEL'),
      ...sharedOptions,
    });
  }

  if (provider === 'anthropic') {
    return new HttpAiProvider({
      provider: 'anthropic',
      apiKey: requireEnv(env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY'),
      model: requireEnv(env.ANTHROPIC_MODEL ?? env.AI_MODEL, 'ANTHROPIC_MODEL ou AI_MODEL'),
      ...sharedOptions,
    });
  }

  throw new Error(`AI_PROVIDER inválido: "${provider}". Use mock, gemini, groq ou anthropic.`);
}

function requireEnv(value: string | undefined, name: string): string {
  if (value && value.trim().length > 0) return value.trim();
  throw new Error(`Configuração de IA incompleta: defina ${name}.`);
}

export type AiProviderName = 'mock' | 'gemini' | 'groq' | 'anthropic';

export interface AiProviderConfigSummary {
  provider: AiProviderName;
  model: string | null;
  apiKeyConfigured: boolean;
  requestTimeoutMs: number | null;
}

/**
 * Leitura read-only da configuração de provider/modelo ATUALMENTE ativa via
 * env — nunca instancia o provider real nem valida a API key
 * (`createAiProvider` já faz isso e lança cedo se faltar algo); aqui o
 * objetivo é só permitir que uma UI operacional mostre "provider ativo: X,
 * modelo: Y" sem precisar de uma segunda cópia da mesma lógica de
 * resolução de provider/modelo/fallback já implementada acima. Nunca
 * retorna a própria API key, só se ela está presente (`apiKeyConfigured`).
 * Troca de provider em runtime continua fora de escopo: é sempre a mesma
 * env var que `createAiProvider()` já lê na inicialização do processo.
 */
export function describeAiProviderConfig(env: AiProviderEnv = process.env): AiProviderConfigSummary {
  const provider = normalizeProviderName(env.AI_PROVIDER);
  const requestTimeoutMs = env.AI_REQUEST_TIMEOUT_MS ? (parseTimeoutMs(env.AI_REQUEST_TIMEOUT_MS) ?? null) : null;

  if (provider === 'groq') {
    return {
      provider,
      model: optionalEnv(env.GROQ_MODEL ?? env.AI_MODEL),
      apiKeyConfigured: hasValue(env.GROQ_API_KEY),
      requestTimeoutMs,
    };
  }

  if (provider === 'gemini') {
    return {
      provider,
      model: optionalEnv(env.GEMINI_MODEL ?? env.AI_MODEL),
      apiKeyConfigured: hasValue(env.GEMINI_API_KEY),
      requestTimeoutMs,
    };
  }

  if (provider === 'anthropic') {
    return {
      provider,
      model: optionalEnv(env.ANTHROPIC_MODEL ?? env.AI_MODEL),
      apiKeyConfigured: hasValue(env.ANTHROPIC_API_KEY),
      requestTimeoutMs,
    };
  }

  return { provider: 'mock', model: null, apiKeyConfigured: true, requestTimeoutMs };
}

function normalizeProviderName(value: string | undefined): AiProviderName {
  const normalized = (value ?? 'mock').trim().toLowerCase();
  if (normalized === 'groq' || normalized === 'gemini' || normalized === 'anthropic') return normalized;
  return 'mock';
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalEnv(value: string | undefined): string | null {
  return hasValue(value) ? value!.trim() : null;
}

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('AI_REQUEST_TIMEOUT_MS deve ser um número positivo.');
  }
  return parsed;
}
