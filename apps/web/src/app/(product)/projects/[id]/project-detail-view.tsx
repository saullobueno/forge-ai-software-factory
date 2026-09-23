'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/labels';
import { taskPriorityTone, taskStatusTone } from '@/lib/status-tone';
import type { ApiProject, ApiTask } from '@/lib/types';

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => apiFetch<ApiProject>(`/projects/${projectId}`),
  });

  const tasksQuery = useQuery({
    queryKey: ['projects', projectId, 'tasks'],
    queryFn: () => apiFetch<ApiTask[]>(`/projects/${projectId}/tasks`),
    enabled: projectQuery.isSuccess,
  });

  if (projectQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando projeto…</p>;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar este projeto.</p>;
  }

  const project = projectQuery.data;
  const techParts = [...project.techProfile.languages, ...project.techProfile.frameworks];

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Projetos', href: '/projects' }, { label: project.name }]} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{project.slug}</p>
          {project.description && <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <Link
          href={`/projects/${projectId}/code`}
          className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Ver código
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Perfil tecnológico</h2>
          {techParts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {techParts.map((part) => (
                <Badge key={part}>{part}</Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Sem perfil tecnológico definido.</p>
          )}
          {project.techProfile.packageManager && (
            <p className="mt-2 text-sm text-muted-foreground">
              Gerenciador de pacotes: <span className="text-foreground">{project.techProfile.packageManager}</span>
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Notas de arquitetura</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {project.architectureNotes ?? 'Nenhuma nota de arquitetura registrada.'}
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 sm:col-span-2">
          <h2 className="text-sm font-medium">Regras de código</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {project.codeRules ?? 'Nenhuma regra de código registrada.'}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium">Tarefas</h2>

        {tasksQuery.isLoading && <p className="mt-2 text-sm text-muted-foreground">Carregando tarefas…</p>}
        {tasksQuery.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Não foi possível carregar as tarefas.</p>
        )}
        {tasksQuery.data && tasksQuery.data.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma tarefa neste projeto ainda.</p>
        )}

        {tasksQuery.data && tasksQuery.data.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {tasksQuery.data.map((task) => (
              <li key={task.id} className="p-4 transition-colors hover:bg-muted">
                <Link href={`/projects/${projectId}/tasks/${task.id}`} className="flex flex-col gap-2">
                  <span className="font-medium text-foreground">{task.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={taskStatusTone(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
                    <Badge tone={taskPriorityTone(task.priority)}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
