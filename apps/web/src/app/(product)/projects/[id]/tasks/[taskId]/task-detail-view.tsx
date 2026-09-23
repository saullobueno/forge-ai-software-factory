'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch, ApiError } from '@/lib/api-client';
import { AGENT_RUN_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/labels';
import { agentRunStatusTone, taskPriorityTone, taskStatusTone } from '@/lib/status-tone';
import type { ApiAgentRun, ApiProject, ApiTask } from '@/lib/types';

export function TaskDetailView({ projectId, taskId }: { projectId: string; taskId: string }) {
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => apiFetch<ApiProject>(`/projects/${projectId}`),
  });

  const taskQuery = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => apiFetch<ApiTask>(`/tasks/${taskId}`),
  });

  const triggerAgentRun = useMutation({
    mutationFn: () => apiFetch<ApiAgentRun>(`/tasks/${taskId}/agent-runs`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    },
  });

  if (taskQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando tarefa…</p>;
  }

  if (taskQuery.isError || !taskQuery.data) {
    return <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar esta tarefa.</p>;
  }

  const task = taskQuery.data;
  const projectName = projectQuery.data?.name ?? '…';

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: 'Projetos', href: '/projects' },
          { label: projectName, href: `/projects/${projectId}` },
          { label: task.title },
        ]}
      />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={taskStatusTone(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
          <Badge tone={taskPriorityTone(task.priority)}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
          {task.labels.map((label) => (
            <Badge key={label}>{label}</Badge>
          ))}
        </div>
      </div>

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Descrição</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {task.description ?? 'Nenhuma descrição registrada.'}
        </p>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Critérios de aceite</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {task.acceptanceCriteria ?? 'Nenhum critério de aceite registrado.'}
        </p>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Dependências</h2>
        {task.dependencies.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Esta tarefa não depende de nenhuma outra.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {task.dependencies.map((dependency) => (
              <li key={dependency.id} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/projects/${projectId}/tasks/${dependency.dependsOnTask.id}`}
                  className="text-foreground hover:underline"
                >
                  {dependency.dependsOnTask.title}
                </Link>
                <Badge tone={taskStatusTone(dependency.dependsOnTask.status)}>
                  {TASK_STATUS_LABELS[dependency.dependsOnTask.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Execução de IA</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Dispara uma execução de IA com escopo definido pela tarefa (spec §7). Esta fase só cria o registro em
          fila — nenhum agente processa a execução ainda.
        </p>

        <button
          type="button"
          onClick={() => triggerAgentRun.mutate()}
          disabled={triggerAgentRun.isPending}
          className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {triggerAgentRun.isPending ? 'Iniciando…' : 'Iniciar execução de IA'}
        </button>

        {triggerAgentRun.isError && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {triggerAgentRun.error instanceof ApiError
              ? triggerAgentRun.error.message
              : 'Não foi possível iniciar a execução de IA.'}
          </p>
        )}

        {triggerAgentRun.isSuccess && (
          <div data-testid="agent-run-result" className="mt-4 rounded-md border border-border bg-muted p-3">
            <div className="flex items-center gap-2">
              <Badge tone={agentRunStatusTone(triggerAgentRun.data.status)}>
                <span data-testid="agent-run-status">{AGENT_RUN_STATUS_LABELS[triggerAgentRun.data.status]}</span>
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{triggerAgentRun.data.id}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{triggerAgentRun.data.objective}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Na fila — ainda não há um orquestrador processando execuções nesta fase do projeto.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
