import type { AgentRunStatus, TaskPriority, TaskStatus } from '@forge/types';

/** Rótulos em pt-BR (spec §7) — status de tarefa. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  ready: 'Pronta',
  planning: 'Planejamento',
  in_progress: 'Em andamento',
  review: 'Revisão',
  testing: 'Testes',
  done: 'Concluída',
  blocked: 'Bloqueada',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

/** Rótulos em pt-BR (spec §9) — ciclo de vida de uma execução de IA. */
export const AGENT_RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  queued: 'Na fila',
  planning: 'Planejando',
  executing: 'Executando',
  testing: 'Testando',
  review: 'Em revisão',
  approval_required: 'Aguardando aprovação',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};
