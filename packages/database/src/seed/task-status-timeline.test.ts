import { canTransitionTaskStatus, transitionTaskStatus } from '@forge/domain';
import { describe, expect, it } from 'vitest';
import { DEMO_TASK_STATUS_TIMELINE } from './task-status-timeline.ts';

describe('DEMO_TASK_STATUS_TIMELINE', () => {
  it('é uma sequência de transições de TaskStatus real e válida do início ao fim', () => {
    expect(DEMO_TASK_STATUS_TIMELINE.length).toBeGreaterThan(1);

    for (let i = 0; i < DEMO_TASK_STATUS_TIMELINE.length - 1; i += 1) {
      const from = DEMO_TASK_STATUS_TIMELINE[i];
      const to = DEMO_TASK_STATUS_TIMELINE[i + 1];
      if (from === undefined || to === undefined) throw new Error('índice fora do array');

      expect(canTransitionTaskStatus(from, to)).toBe(true);
      expect(transitionTaskStatus(from, to)).toEqual({ success: true, status: to });
    }
  });

  it('começa em "backlog" e termina no status final seedado para a task demo ("done")', () => {
    expect(DEMO_TASK_STATUS_TIMELINE[0]).toBe('backlog');
    expect(DEMO_TASK_STATUS_TIMELINE.at(-1)).toBe('done');
  });

  it('rejeitaria uma sequência inventada que pule etapas (garante que o teste acima não é vácuo)', () => {
    expect(canTransitionTaskStatus('backlog', 'done')).toBe(false);
    expect(canTransitionTaskStatus('in_progress', 'review')).toBe(true);
    expect(canTransitionTaskStatus('review', 'done')).toBe(false);
  });
});
