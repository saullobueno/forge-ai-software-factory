import { describe, expect, it } from 'vitest';
import { aiPlaygroundEvaluationRequestSchema, aiUsageSchema } from './ai.ts';

const id = '11111111-1111-1111-1111-111111111111';
const base = {
  id,
  organizationId: id,
  agentRunId: id,
  agentStepId: id,
  aiMessageId: id,
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  costUsd: 0.01,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('aiUsageSchema', () => {
  it('aceita quando totalTokens é a soma de prompt + completion', () => {
    expect(() =>
      aiUsageSchema.parse({ ...base, promptTokens: 100, completionTokens: 50, totalTokens: 150 }),
    ).not.toThrow();
  });

  it('rejeita quando totalTokens não bate com a soma', () => {
    expect(() =>
      aiUsageSchema.parse({ ...base, promptTokens: 100, completionTokens: 50, totalTokens: 200 }),
    ).toThrow(/totalTokens deve ser igual/);
  });
});

describe('aiPlaygroundEvaluationRequestSchema', () => {
  it('aplica defaults seguros para comparação de modelos', () => {
    const parsed = aiPlaygroundEvaluationRequestSchema.parse({
      prompt: 'Responda em JSON com summary e decision.',
      dataset: [{ id: 'case-1', title: 'Caso 1', input: 'Validar estorno.', expectedKeywords: ['estorno'] }],
    });

    expect(parsed.models).toEqual(['forge-mock-fast', 'forge-mock-balanced']);
    expect(parsed.requireStructuredOutput).toBe(true);
  });

  it('limita dataset e modelos aceitos', () => {
    expect(() =>
      aiPlaygroundEvaluationRequestSchema.parse({
        prompt: 'Teste',
        models: ['modelo-inexistente'],
        dataset: [{ id: 'case-1', title: 'Caso 1', input: 'Entrada.' }],
      }),
    ).toThrow();
  });
});
