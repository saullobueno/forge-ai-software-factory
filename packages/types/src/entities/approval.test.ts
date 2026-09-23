import { describe, expect, it } from 'vitest';
import { approvalSchema } from './approval.ts';

const id = '11111111-1111-1111-1111-111111111111';
const base = {
  id,
  organizationId: id,
  subjectType: 'deployment' as const,
  subjectId: id,
  requestedByUserId: id,
  reason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('approvalSchema', () => {
  it('aceita uma aprovação pendente sem decidedAt/approvedByUserId', () => {
    expect(() =>
      approvalSchema.parse({
        ...base,
        status: 'pending',
        approvedByUserId: null,
        decidedAt: null,
      }),
    ).not.toThrow();
  });

  it('aceita uma aprovação concedida com decidedAt e approvedByUserId', () => {
    expect(() =>
      approvalSchema.parse({
        ...base,
        status: 'approved',
        approvedByUserId: id,
        decidedAt: new Date(),
      }),
    ).not.toThrow();
  });

  it('rejeita uma aprovação pendente com decidedAt definido', () => {
    expect(() =>
      approvalSchema.parse({
        ...base,
        status: 'pending',
        approvedByUserId: null,
        decidedAt: new Date(),
      }),
    ).toThrow(/pendentes não podem ter decidedAt/);
  });

  it('rejeita uma aprovação concedida sem approvedByUserId', () => {
    expect(() =>
      approvalSchema.parse({
        ...base,
        status: 'approved',
        approvedByUserId: null,
        decidedAt: new Date(),
      }),
    ).toThrow(/exigem approvedByUserId/);
  });

  it('rejeita uma aprovação rejeitada sem decidedAt', () => {
    expect(() =>
      approvalSchema.parse({
        ...base,
        status: 'rejected',
        approvedByUserId: null,
        decidedAt: null,
      }),
    ).toThrow(/decididas exigem decidedAt/);
  });
});
