import { describe, expect, it } from 'vitest';

import { DEFAULT_DEVELOPMENT_JWT_SECRET, parseEnv, readAiUsageLimits } from './env.js';

describe('parseEnv', () => {
  it('mantém fallbacks locais fora de produção', () => {
    expect(parseEnv({ NODE_ENV: 'development' })).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 3001,
      JWT_SECRET: DEFAULT_DEVELOPMENT_JWT_SECRET,
    });
  });

  it('exige banco, fila e segredo real em produção', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
      'Configuração de produção incompleta: defina DATABASE_URL, REDIS_URL, JWT_SECRET.',
    );
  });

  it('aceita configuração mínima de produção', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://forge:forge@example.com:5432/forge',
        REDIS_URL: 'rediss://default:secret@example.com:6379',
        JWT_SECRET: 'production-secret-with-enough-entropy',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://forge:forge@example.com:5432/forge',
      REDIS_URL: 'rediss://default:secret@example.com:6379',
      JWT_SECRET: 'production-secret-with-enough-entropy',
    });
  });

  it('lê limites opcionais de uso de IA', () => {
    expect(
      readAiUsageLimits({
        AI_ORG_DAILY_TOKEN_LIMIT: '100000',
        AI_ORG_DAILY_COST_LIMIT_USD: '2.50',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      dailyTokenLimit: 100000,
      dailyCostLimitUsd: 2.5,
    });
  });
});
