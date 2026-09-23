import { canTransitionAgentRunStatus, transitionAgentRunStatus } from '@forge/domain';
import { describe, expect, it } from 'vitest';
import { DEMO_AGENT_RUN_STATUS_TIMELINE } from './agent-run-timeline.ts';

describe('DEMO_AGENT_RUN_STATUS_TIMELINE', () => {
  it('é uma sequência de transições de AgentRunStatus real e válida do início ao fim', () => {
    expect(DEMO_AGENT_RUN_STATUS_TIMELINE.length).toBeGreaterThan(1);

    for (let i = 0; i < DEMO_AGENT_RUN_STATUS_TIMELINE.length - 1; i += 1) {
      const from = DEMO_AGENT_RUN_STATUS_TIMELINE[i];
      const to = DEMO_AGENT_RUN_STATUS_TIMELINE[i + 1];
      if (from === undefined || to === undefined) throw new Error('índice fora do array');

      expect(canTransitionAgentRunStatus(from, to)).toBe(true);
      expect(transitionAgentRunStatus(from, to)).toEqual({ success: true, status: to });
    }
  });

  it('começa em "queued" e termina no status final seedado para o agentRun demo ("completed")', () => {
    expect(DEMO_AGENT_RUN_STATUS_TIMELINE[0]).toBe('queued');
    expect(DEMO_AGENT_RUN_STATUS_TIMELINE.at(-1)).toBe('completed');
  });

  it('rejeitaria uma sequência inventada que pule etapas (garante que o teste acima não é vácuo)', () => {
    expect(canTransitionAgentRunStatus('queued', 'testing')).toBe(false);
    expect(canTransitionAgentRunStatus('testing', 'review')).toBe(true);
    expect(canTransitionAgentRunStatus('review', 'completed')).toBe(false);
  });
});
