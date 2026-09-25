import { describe, expect, it } from 'vitest';
import { pullRequestSchema } from './git.ts';

const id = '11111111-1111-1111-1111-111111111111';
const base = {
  id,
  organizationId: id,
  projectId: id,
  repositoryId: id,
  workspaceId: null,
  taskId: null,
  agentRunId: null,
  provider: 'mock' as const,
  externalNumber: null,
  externalUrl: null,
  title: 'Adiciona login',
  description: null,
  sourceBranch: 'feature/login',
  targetBranch: 'main',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('pullRequestSchema', () => {
  it('aceita um PR aberto sem mergedAt', () => {
    expect(() => pullRequestSchema.parse({ ...base, status: 'open', mergedAt: null })).not.toThrow();
  });

  it('aceita um PR merged com mergedAt definido', () => {
    expect(() =>
      pullRequestSchema.parse({ ...base, status: 'merged', mergedAt: new Date() }),
    ).not.toThrow();
  });

  it('rejeita mergedAt definido quando status não é merged', () => {
    expect(() =>
      pullRequestSchema.parse({ ...base, status: 'open', mergedAt: new Date() }),
    ).toThrow(/mergedAt só pode ser definido/);
  });

  it('rejeita status merged sem mergedAt', () => {
    expect(() => pullRequestSchema.parse({ ...base, status: 'merged', mergedAt: null })).toThrow(
      /exige mergedAt/,
    );
  });
});
