import { describe, expect, it } from 'vitest';
import { createAiProvider, describeAiProviderConfig } from './factory.ts';
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

  it('cria provider Anthropic usando ANTHROPIC_MODEL quando definido', () => {
    const provider = createAiProvider({
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'key',
      ANTHROPIC_MODEL: 'claude-test',
    });
    expect(provider).toBeInstanceOf(HttpAiProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('falha cedo quando provider real não tem chave/modelo', () => {
    expect(() => createAiProvider({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'key' })).toThrow(/AI_MODEL/);
    expect(() => createAiProvider({ AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-test' })).toThrow(/GEMINI_API_KEY/);
    expect(() => createAiProvider({ AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-test' })).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('describeAiProviderConfig', () => {
  it('descreve mock por padrão, sem exigir nenhuma env var', () => {
    expect(describeAiProviderConfig({})).toEqual({
      provider: 'mock',
      model: null,
      apiKeyConfigured: true,
      requestTimeoutMs: null,
    });
  });

  it('descreve groq configurado, sem nunca expor a própria API key', () => {
    const summary = describeAiProviderConfig({
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'secret-key',
      GROQ_MODEL: 'llama-3.1-70b-versatile',
      AI_REQUEST_TIMEOUT_MS: '5000',
    });
    expect(summary).toEqual({
      provider: 'groq',
      model: 'llama-3.1-70b-versatile',
      apiKeyConfigured: true,
      requestTimeoutMs: 5000,
    });
    expect(JSON.stringify(summary)).not.toContain('secret-key');
  });

  it('cai para AI_MODEL quando o modelo específico do provider não está definido', () => {
    expect(describeAiProviderConfig({ AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-fallback' })).toMatchObject({
      provider: 'gemini',
      model: 'gemini-fallback',
    });
  });

  it('reporta apiKeyConfigured=false quando o provider real está selecionado mas sem chave', () => {
    expect(describeAiProviderConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_MODEL: 'claude-test' })).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      apiKeyConfigured: false,
      requestTimeoutMs: null,
    });
  });
});
