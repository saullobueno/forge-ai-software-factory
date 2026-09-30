'use client';

import { useQuery } from '@tanstack/react-query';
import type { TaskStatus } from '@forge/types';
import { apiFetch } from '@/lib/api-client';
import { TASK_STATUS_LABELS } from '@/lib/labels';
import type { ApiTaskActivity } from '@/lib/types';

const FIELD_LABELS: Record<string, string> = {
  title: 'título',
  description: 'descrição',
  acceptanceCriteria: 'critérios de aceite',
  priority: 'prioridade',
  assigneeId: 'responsável',
  labels: 'etiquetas',
};

function statusLabel(value: unknown): string {
  return typeof value === 'string' && value in TASK_STATUS_LABELS
    ? TASK_STATUS_LABELS[value as TaskStatus]
    : String(value ?? '?');
}

/** Frase em pt-BR para um evento de auditoria da tarefa. */
export function describeActivity(activity: Pick<ApiTaskActivity, 'action' | 'metadata'>): string {
  const { action, metadata } = activity;
  switch (action) {
    case 'task.created':
      return 'criou a tarefa';
    case 'task.updated': {
      const fields = Array.isArray(metadata['changedFields'])
        ? (metadata['changedFields'] as string[]).map((field) => FIELD_LABELS[field] ?? field)
        : [];
      return fields.length > 0 ? `editou ${fields.join(', ')}` : 'editou a tarefa';
    }
    case 'task.status_changed':
      return `moveu de "${statusLabel(metadata['from'])}" para "${statusLabel(metadata['to'])}"`;
    case 'task.dependency_added':
      return 'adicionou uma dependência';
    case 'task.dependency_removed':
      return 'removeu uma dependência';
    case 'task.comment_added':
      return 'comentou';
    case 'task.comment_deleted':
      return 'apagou um comentário';
    default:
      return action;
  }
}

export function TaskActivity({ taskId }: { taskId: string }) {
  const activityQuery = useQuery({
    queryKey: ['tasks', taskId, 'activity'],
    queryFn: () => apiFetch<ApiTaskActivity[]>(`/tasks/${taskId}/activity`),
  });
  const activity = activityQuery.data ?? [];

  return (
    <section className="rounded-lg border border-border p-4" data-testid="task-activity">
      <h2 className="text-sm font-medium">Atividade</h2>
      {activityQuery.isLoading && <p className="mt-2 text-sm text-muted-foreground">Carregando histórico…</p>}
      {activityQuery.data && activity.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">Sem atividade registrada.</p>
      )}
      {activity.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2">
          {activity.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{item.actorName ?? 'Sistema'}</span>
              <span className="text-muted-foreground">{describeActivity(item)}</span>
              <span className="text-xs text-muted-foreground">· {new Date(item.createdAt).toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
