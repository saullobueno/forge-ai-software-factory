import { describe, expect, it } from 'vitest';

import { DEFAULT_DEVELOPMENT_JWT_SECRET, parseEnv } from './env.js';

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
});
