import { describe, expect, it } from 'vitest';
import { loginRequestSchema, loginResponseSchema } from './auth.ts';

describe('loginRequestSchema', () => {
  it('aceita email e senha válidos', () => {
    expect(() =>
      loginRequestSchema.parse({ email: 'dev@acme.example', password: 'demo1234' }),
    ).not.toThrow();
  });

  it('rejeita email malformado', () => {
    expect(() =>
      loginRequestSchema.parse({ email: 'not-an-email', password: 'demo1234' }),
    ).toThrow();
  });

  it('rejeita senha abaixo do tamanho mínimo', () => {
    expect(() => loginRequestSchema.parse({ email: 'dev@acme.example', password: 'short' })).toThrow();
  });
});

describe('loginResponseSchema', () => {
  it('descarta campos sensíveis não declarados em userSchema (ex.: passwordHash)', () => {
    const parsed = loginResponseSchema.parse({
      token: 'jwt-token',
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        organizationId: '22222222-2222-2222-2222-222222222222',
        email: 'dev@acme.example',
        name: 'Dev',
        avatarUrl: null,
        role: 'developer',
        // campo extra simulando o que viria direto da linha do banco
        passwordHash: 'salt:hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    expect(parsed.user).not.toHaveProperty('passwordHash');
  });
});
