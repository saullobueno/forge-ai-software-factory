import type { AgentRole, AgentRunStatus } from '@forge/types';

/**
 * Ordem de execução narrativa dos 6 papéis de agente (spec §8) na execução
 * demo (Fase 3). Não é a ordem em que a spec lista os papéis, e sim uma
 * ordem de pipeline plausível: planejar -> explorar código -> implementar
 * -> documentar -> testar -> revisar. `documentation_agent` roda logo após
 * o `implementer` (atualiza comentário/README junto da mudança) e antes do
 * `test_engineer` validar tudo, para que o `reviewer` seja sempre o último
 * passo antes da aprovação humana — coerente com o ciclo da spec §9 (...→
 * Testando → Revisão → Aprovação Necessária → Concluída).
 */
export const DEMO_AGENT_STEP_ORDER: readonly AgentRole[] = [
  'planner',
  'code_explorer',
  'implementer',
  'documentation_agent',
  'test_engineer',
  'reviewer',
];

/**
 * Status do AgentRun (spec §9) vigente durante/por causa de cada step, na
 * mesma ordem de `DEMO_AGENT_STEP_ORDER`. Vários steps compartilham
 * "executing": a spec só distingue Planejando/Executando/Testando/Revisão
 * no nível da execução, não uma fase por papel — exploração, implementação
 * e documentação cabem todas em "Executando".
 */
export const DEMO_STEP_RUN_STATUS: readonly AgentRunStatus[] = [
  'planning', // planner
  'executing', // code_explorer
  'executing', // implementer
  'executing', // documentation_agent
  'testing', // test_engineer
  'review', // reviewer
];

function dedupeConsecutive<T>(values: readonly T[]): T[] {
  const result: T[] = [];
  for (const value of values) {
    if (result[result.length - 1] !== value) result.push(value);
  }
  return result;
}

/**
 * Linha do tempo completa de status do AgentRun demo, do início
 * ("queued") até o estado final ("completed"): status consecutivos
 * repetidos de `DEMO_STEP_RUN_STATUS` são colapsados (um AgentRun não
 * "retransiciona" para o mesmo status) e a etapa final de aprovação humana
 * é anexada (spec §9: Revisão -> Aprovação Necessária -> Concluída). Esta é
 * a sequência validada por `agent-run-timeline.test.ts` via
 * `canTransitionAgentRunStatus`/`transitionAgentRunStatus` — prova que a
 * história contada pelos dados de seed é alcançável de verdade, não apenas
 * um valor de status final escolhido à mão.
 */
export const DEMO_AGENT_RUN_STATUS_TIMELINE: readonly AgentRunStatus[] = [
  'queued',
  ...dedupeConsecutive(DEMO_STEP_RUN_STATUS),
  'approval_required',
  'completed',
];
