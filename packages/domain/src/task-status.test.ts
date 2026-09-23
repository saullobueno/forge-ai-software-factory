import { taskStatusSchema } from '@forge/types';
import { describe, expect, it } from 'vitest';
import { canTransitionTaskStatus, transitionTaskStatus } from './task-status.ts';

const ALL_STATUSES = taskStatusSchema.options;

describe('canTransitionTaskStatus', () => {
  it('permite o fluxo feliz completo do ciclo de vida de uma tarefa', () => {
    expect(canTransitionTaskStatus('backlog', 'ready')).toBe(true);
    expect(canTransitionTaskStatus('ready', 'planning')).toBe(true);
    expect(canTransitionTaskStatus('planning', 'in_progress')).toBe(true);
    expect(canTransitionTaskStatus('in_progress', 'review')).toBe(true);
    expect(canTransitionTaskStatus('review', 'testing')).toBe(true);
    expect(canTransitionTaskStatus('testing', 'done')).toBe(true);
  });

  it('permite bloquear a partir de qualquer estado não terminal', () => {
    for (const status of ALL_STATUSES) {
      if (status === 'done' || status === 'blocked') continue;
      expect(canTransitionTaskStatus(status, 'blocked')).toBe(true);
    }
  });

  it('rejeita transições para o mesmo status', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionTaskStatus(status, status)).toBe(false);
    }
  });

  it('rejeita pular etapas do fluxo principal (ex.: backlog -> in_progress)', () => {
    expect(canTransitionTaskStatus('backlog', 'in_progress')).toBe(false);
    expect(canTransitionTaskStatus('backlog', 'done')).toBe(false);
    expect(canTransitionTaskStatus('ready', 'done')).toBe(false);
  });

  it('"done" é terminal — nenhuma transição sai dele', () => {
    for (const status of ALL_STATUSES) {
      if (status === 'done') continue;
      expect(canTransitionTaskStatus('done', status)).toBe(false);
    }
  });
});

describe('transitionTaskStatus', () => {
  it('retorna sucesso com o novo status quando a transição é válida', () => {
    const result = transitionTaskStatus('ready', 'planning');
    expect(result).toEqual({ success: true, status: 'planning' });
  });

  it('retorna erro descritivo quando a transição é inválida', () => {
    const result = transitionTaskStatus('done', 'backlog');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('done');
      expect(result.error).toContain('backlog');
    }
  });
});
