import { describe, expect, it } from 'vitest';
import { deploymentSchema } from './environment';

const id = '11111111-1111-1111-1111-111111111111';
const base = {
  id,
  organizationId: id,
  environmentId: id,
  projectId: id,
  pullRequestId: null,
  commitSha: 'abc1234',
  deployedByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('deploymentSchema', () => {
  it('aceita um deployment "running" sem completedAt', () => {
    expect(() =>
      deploymentSchema.parse({ ...base, status: 'running', startedAt: new Date(), completedAt: null }),
    ).not.toThrow();
  });

  it('rejeita um deployment em estado terminal sem completedAt', () => {
    for (const status of ['succeeded', 'failed', 'rolled_back'] as const) {
      expect(() =>
        deploymentSchema.parse({ ...base, status, startedAt: new Date(), completedAt: null }),
      ).toThrow(/exigem completedAt/);
    }
  });
});
