import { describe, expect, it } from 'vitest';
import { agentRunStatusSchema, taskStatusSchema } from './enums.ts';

describe('taskStatusSchema', () => {
  it('aceita os status definidos na spec', () => {
    expect(taskStatusSchema.parse('backlog')).toBe('backlog');
    expect(taskStatusSchema.parse('done')).toBe('done');
  });

  it('rejeita valores fora do enum', () => {
    expect(() => taskStatusSchema.parse('invalido')).toThrow();
  });
});

describe('agentRunStatusSchema', () => {
  it('aceita o ciclo de vida completo de uma execução', () => {
    for (const status of [
      'queued',
      'planning',
      'executing',
      'testing',
      'review',
      'approval_required',
      'completed',
      'failed',
      'cancelled',
    ]) {
      expect(agentRunStatusSchema.parse(status)).toBe(status);
    }
  });
});
