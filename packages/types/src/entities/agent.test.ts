import { describe, expect, it } from 'vitest';
import { agentRunSchema, agentStepSchema } from './agent';

const id = '11111111-1111-1111-1111-111111111111';
const baseRun = {
  id,
  organizationId: id,
  taskId: id,
  agentId: id,
  workspaceId: null,
  objective: 'Implementar endpoint de login',
  scope: {},
  totalTokens: 0,
  totalCostUsd: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('agentRunSchema', () => {
  it('aceita uma execução "queued" sem startedAt/completedAt', () => {
    expect(() =>
      agentRunSchema.parse({ ...baseRun, status: 'queued', startedAt: null, completedAt: null }),
    ).not.toThrow();
  });

  it('aceita uma execução "completed" com completedAt definido', () => {
    expect(() =>
      agentRunSchema.parse({
        ...baseRun,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      }),
    ).not.toThrow();
  });

  it('rejeita uma execução em estado terminal sem completedAt', () => {
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      expect(() =>
        agentRunSchema.parse({ ...baseRun, status, startedAt: new Date(), completedAt: null }),
      ).toThrow(/exigem completedAt/);
    }
  });
});

describe('agentStepSchema', () => {
  const baseStep = {
    id,
    agentRunId: id,
    name: 'Planejar mudanças',
    role: 'planner' as const,
    status: 'succeeded' as const,
    input: {},
    output: null,
    tokens: 0,
    costUsd: 0,
    durationMs: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('aceita completedAt igual ou posterior a startedAt', () => {
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const completedAt = new Date('2026-01-01T00:00:05Z');
    expect(() => agentStepSchema.parse({ ...baseStep, startedAt, completedAt })).not.toThrow();
  });

  it('rejeita completedAt anterior a startedAt', () => {
    const startedAt = new Date('2026-01-01T00:00:05Z');
    const completedAt = new Date('2026-01-01T00:00:00Z');
    expect(() => agentStepSchema.parse({ ...baseStep, startedAt, completedAt })).toThrow(
      /não pode ser anterior/,
    );
  });
});
