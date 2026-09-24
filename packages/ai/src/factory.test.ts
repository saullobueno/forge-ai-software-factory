import { describe, expect, it } from 'vitest';
import { createAiProvider } from './factory.ts';
import { HttpAiProvider } from './http-provider.ts';
import { MockAiProvider } from './mock-provider.ts';

describe('createAiProvider', () => {
  it('usa o provider mock por padrão, mesmo sem credenciais externas', () => {
    expect(createAiProvider({})).toBeInstanceOf(MockAiProvider);
  });

  it('cria provider Groq quando AI_PROVIDER=groq e a configuração obrigatória existe', () => {
    const provider = createAiProvider({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'key', AI_MODEL: 'llama-test' });
    expect(provider).toBeInstanceOf(HttpAiProvider);
    expect(provider.name).toBe('groq');
  });

  it('cria provider Gemini usando GEMINI_MODEL quando definido', () => {
    const provider = createAiProvider({
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'key',
      GEMINI_MODEL: 'gemini-test',
    });
    expect(provider).toBeInstanceOf(HttpAiProvider);
    expect(provider.name).toBe('gemini');
  });

  it('falha cedo quando provider real não tem chave/modelo', () => {
    expect(() => createAiProvider({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'key' })).toThrow(/AI_MODEL/);
    expect(() => createAiProvider({ AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-test' })).toThrow(/GEMINI_API_KEY/);
  });

  it('mantém Anthropic como erro explícito até o provider existir', () => {
    expect(() => createAiProvider({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'key' })).toThrow(/anthropic/i);
  });
});
