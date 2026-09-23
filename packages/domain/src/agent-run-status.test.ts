import { agentRunStatusSchema } from '@forge/types';
import { describe, expect, it } from 'vitest';
import { canTransitionAgentRunStatus, transitionAgentRunStatus } from './agent-run-status';

const ALL_STATUSES = agentRunStatusSchema.options;
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const;

describe('canTransitionAgentRunStatus', () => {
  it('permite o fluxo feliz completo do ciclo de execução', () => {
    expect(canTransitionAgentRunStatus('queued', 'planning')).toBe(true);
    expect(canTransitionAgentRunStatus('planning', 'executing')).toBe(true);
    expect(canTransitionAgentRunStatus('executing', 'testing')).toBe(true);
    expect(canTransitionAgentRunStatus('testing', 'review')).toBe(true);
    expect(canTransitionAgentRunStatus('review', 'approval_required')).toBe(true);
    expect(canTransitionAgentRunStatus('approval_required', 'completed')).toBe(true);
  });

  it('permite falhar ou cancelar a partir de qualquer estado não terminal', () => {
    for (const status of ALL_STATUSES) {
      if ((TERMINAL_STATUSES as readonly string[]).includes(status)) continue;
      expect(canTransitionAgentRunStatus(status, 'failed')).toBe(true);
      expect(canTransitionAgentRunStatus(status, 'cancelled')).toBe(true);
    }
  });

  it('nunca permite ir direto de "testing" para "completed" — testes falhando não podem ser aprovados automaticamente', () => {
    expect(canTransitionAgentRunStatus('testing', 'completed')).toBe(false);
  });

  it('permite que review e approval_required devolvam a execução para executing (pedido de ajustes)', () => {
    expect(canTransitionAgentRunStatus('review', 'executing')).toBe(true);
    expect(canTransitionAgentRunStatus('approval_required', 'executing')).toBe(true);
  });

  it('rejeita pular etapas (ex.: queued -> executing)', () => {
    expect(canTransitionAgentRunStatus('queued', 'executing')).toBe(false);
    expect(canTransitionAgentRunStatus('queued', 'completed')).toBe(false);
  });

  it('estados terminais não têm transições de saída', () => {
    for (const terminal of TERMINAL_STATUSES) {
      for (const status of ALL_STATUSES) {
        expect(canTransitionAgentRunStatus(terminal, status)).toBe(false);
      }
    }
  });

  it('rejeita transições para o mesmo status', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionAgentRunStatus(status, status)).toBe(false);
    }
  });
});

describe('transitionAgentRunStatus', () => {
  it('retorna sucesso com o novo status quando a transição é válida', () => {
    expect(transitionAgentRunStatus('executing', 'testing')).toEqual({
      success: true,
      status: 'testing',
    });
  });

  it('retorna erro descritivo quando a transição é inválida', () => {
    const result = transitionAgentRunStatus('completed', 'executing');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('completed');
      expect(result.error).toContain('executing');
    }
  });
});
