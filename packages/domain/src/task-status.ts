import type { TaskStatus } from '@forge/types';

/**
 * Grafo de transições válidas de TaskStatus (spec §7: Backlog, Pronta,
 * Planejamento, Em Andamento, Revisão, Testes, Concluída, Bloqueada).
 *
 * "blocked" é tratado como um estado de interrupção alcançável a partir de
 * qualquer estado ativo, e que pode retomar para qualquer estado ativo
 * (a aplicação decide para onde retomar com base no motivo do bloqueio —
 * esta função só valida se o par from/to é permitido). "done" é terminal.
 */
const TASK_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['ready', 'blocked'],
  ready: ['planning', 'backlog', 'blocked'],
  planning: ['in_progress', 'ready', 'blocked'],
  in_progress: ['review', 'blocked'],
  review: ['testing', 'in_progress', 'blocked'],
  testing: ['done', 'in_progress', 'blocked'],
  blocked: ['backlog', 'ready', 'planning', 'in_progress', 'review', 'testing'],
  done: [],
};

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

export type TaskStatusTransitionResult =
  | { success: true; status: TaskStatus }
  | { success: false; error: string };

export function transitionTaskStatus(
  current: TaskStatus,
  to: TaskStatus,
): TaskStatusTransitionResult {
  if (!canTransitionTaskStatus(current, to)) {
    return {
      success: false,
      error: `Transição de status de tarefa inválida: "${current}" -> "${to}"`,
    };
  }
  return { success: true, status: to };
}
