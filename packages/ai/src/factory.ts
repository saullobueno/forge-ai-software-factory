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

  if (provider === 'anthropic' || env.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic ainda não está implementado. Use mock, gemini ou groq.');
  }

  throw new Error(`AI_PROVIDER inválido: "${provider}". Use mock, gemini ou groq.`);
}

function requireEnv(value: string | undefined, name: string): string {
  if (value && value.trim().length > 0) return value.trim();
  throw new Error(`Configuração de IA incompleta: defina ${name}.`);
}

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('AI_REQUEST_TIMEOUT_MS deve ser um número positivo.');
  }
  return parsed;
}
