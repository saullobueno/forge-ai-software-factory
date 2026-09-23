import { describe, expect, it } from 'vitest';
import { secretReferenceSchema } from './secret';

const id = '11111111-1111-1111-1111-111111111111';
const base = {
  id,
  organizationId: id,
  projectId: null,
  environmentId: null,
  name: 'STRIPE_API_KEY',
  provider: 'vault' as const,
  externalRef: 'vault://forge/prod/stripe-api-key',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('secretReferenceSchema', () => {
  it('aceita uma referência válida a um secret externo', () => {
    expect(() => secretReferenceSchema.parse(base)).not.toThrow();
  });

  it('rejeita qualquer campo extra — nunca aceita um valor de secret cru', () => {
    expect(() =>
      secretReferenceSchema.parse({ ...base, value: 'sk_live_super_secret' }),
    ).toThrow();
  });
});
