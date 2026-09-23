import { describe, expect, it } from 'vitest';
import { aiUsageSchema } from './ai';

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
