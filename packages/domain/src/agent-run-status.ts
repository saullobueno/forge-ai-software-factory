import type { AgentRunStatus } from '@forge/types';

/**
 * Grafo de transições válidas de AgentRunStatus (spec §9: Na Fila →
 * Planejando → Executando → Testando → Revisão → Aprovação Necessária →
 * Concluída/Falhou/Cancelada).
 *
 * O ciclo principal é linear, mas cada estágio ativo pode falhar ou ser
 * cancelado a qualquer momento, e "review"/"approval_required" podem
 * devolver a execução para "executing" quando o revisor ou o aprovador
 * pedem ajustes. "completed"/"failed"/"cancelled" são terminais — spec
 * §12: uma execução com testes falhando nunca é promovida a aprovada, por
 * isso "testing" não transiciona para "review" em caso de falha (a
 * aplicação deve mover para "failed" quando os testes falham).
 */
const AGENT_RUN_STATUS_TRANSITIONS: Readonly<Record<AgentRunStatus, readonly AgentRunStatus[]>> = {
  queued: ['planning', 'failed', 'cancelled'],
  planning: ['executing', 'failed', 'cancelled'],
  executing: ['testing', 'failed', 'cancelled'],
  testing: ['review', 'failed', 'cancelled'],
  review: ['approval_required', 'executing', 'failed', 'cancelled'],
  approval_required: ['completed', 'executing', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionAgentRunStatus(from: AgentRunStatus, to: AgentRunStatus): boolean {
  if (from === to) return false;
  return AGENT_RUN_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Um status de execução é "cancelável" quando existe uma transição válida
 * dele para `cancelled` (Fase 6 — `POST /agent-runs/:id/cancel`). Deriva
 * direto do grafo acima em vez de listar os status manualmente, para nunca
 * divergir de `AGENT_RUN_STATUS_TRANSITIONS` se o grafo mudar: hoje é
 * verdade para todo status não-terminal (`queued`, `planning`, `executing`,
 * `testing`, `review`, `approval_required`) e falso para os 3 terminais
 * (`completed`, `failed`, `cancelled`).
 */
export function isAgentRunStatusCancellable(status: AgentRunStatus): boolean {
  return canTransitionAgentRunStatus(status, 'cancelled');
}

export type AgentRunStatusTransitionResult =
  | { success: true; status: AgentRunStatus }
  | { success: false; error: string };

export function transitionAgentRunStatus(
  current: AgentRunStatus,
  to: AgentRunStatus,
): AgentRunStatusTransitionResult {
  if (!canTransitionAgentRunStatus(current, to)) {
    return {
      success: false,
      error: `Transição de status de execução de agente inválida: "${current}" -> "${to}"`,
    };
  }
  return { success: true, status: to };
}
