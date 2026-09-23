import type { TaskStatus } from '@forge/types';

/**
 * Linha do tempo de status da tarefa demo (spec §7), do estado inicial de
 * uma tarefa recém-criada ("backlog") até o estado final seedado ("done"):
 * o bug foi planejado, implementado, revisado, testado e o PR foi
 * mergeado. Validada em `task-status-timeline.test.ts` via
 * `canTransitionTaskStatus`/`transitionTaskStatus` — prova que o status
 * final gravado em `run-seed.ts` é alcançável por uma sequência real de
 * transições, não um valor escolhido à mão sem verificação.
 */
export const DEMO_TASK_STATUS_TIMELINE: readonly TaskStatus[] = [
  'backlog',
  'ready',
  'planning',
  'in_progress',
  'review',
  'testing',
  'done',
];
