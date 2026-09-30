'use client';

import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskPriority, TaskStatus } from '@forge/types';
import Link from 'next/link';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch, ApiError } from '@/lib/api-client';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/labels';
import { canManageTask } from '@/lib/project-permissions';
import { taskPriorityTone, taskStatusTone } from '@/lib/status-tone';
import type { ApiCurrentUser, ApiProject, ApiTaskListItem, Paginated } from '@/lib/types';

const STATUSES: TaskStatus[] = ['backlog', 'ready', 'planning', 'in_progress', 'review', 'testing', 'done', 'blocked'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const FIELD_CLASS = 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

type View = 'list' | 'kanban';

interface Filters {
  projectId: string;
  status: string;
  priority: string;
  q: string;
}

function queryString(filters: Filters): string {
  const params = new URLSearchParams({ limit: '200' });
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.q) params.set('q', filters.q);
  return params.toString();
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('kanban');
  const [filters, setFilters] = useState<Filters>({ projectId: '', status: '', priority: '', q: '' });
  const [searchInput, setSearchInput] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const effectiveFilters = view === 'kanban' ? { ...filters, status: '' } : filters;

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'global', effectiveFilters],
    queryFn: () => apiFetch<Paginated<ApiTaskListItem>>(`/tasks?${queryString(effectiveFilters)}`),
  });
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Paginated<ApiProject>>('/projects'),
  });
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<ApiCurrentUser>('/auth/me'),
  });
  const mayMove = currentUserQuery.data !== undefined && canManageTask(currentUserQuery.data.role);

  const move = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      apiFetch<unknown>(`/tasks/${taskId}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: (_data, variables) => {
      setFeedback(`Tarefa movida para "${TASK_STATUS_LABELS[variables.status]}".`);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => {
      setFeedback(error instanceof ApiError ? error.message : 'Não foi possível mover a tarefa.');
    },
  });

  const tasks = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data]);
  const byStatus = useMemo(() => {
    const groups = new Map<TaskStatus, ApiTaskListItem[]>(STATUSES.map((status) => [status, []]));
    for (const task of tasks) groups.get(task.status)?.push(task);
    return groups;
  }, [tasks]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: searchInput.trim() }));
  };

  const handleDrop = (event: DragEvent<HTMLElement>, target: TaskStatus) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === target) return;
    if (task.projectIsProtected) {
      setFeedback('Tarefas do projeto de demonstração não podem ser movidas.');
      return;
    }
    if (!task.allowedNextStatuses.includes(target)) {
      setFeedback(
        `Não dá para ir de "${TASK_STATUS_LABELS[task.status]}" direto para "${TASK_STATUS_LABELS[target]}".`,
      );
      return;
    }
    move.mutate({ taskId: task.id, status: target });
  };

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Tarefas' }]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Todas as tarefas da organização, em lista ou Kanban.</p>
        </div>
        <div role="group" aria-label="Modo de visualização" className="flex overflow-hidden rounded-md border border-border">
          {(['kanban', 'list'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              data-testid={`view-${option}`}
              onClick={() => setView(option)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                view === option ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {option === 'kanban' ? 'Kanban' : 'Lista'}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3" aria-label="Filtros de tarefas">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-q" className="text-xs font-medium text-muted-foreground">
            Buscar por título
          </label>
          <input
            id="filter-q"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ex.: migrar"
            className={`${FIELD_CLASS} w-56`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-project" className="text-xs font-medium text-muted-foreground">
            Projeto
          </label>
          <select
            id="filter-project"
            value={filters.projectId}
            onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value }))}
            className={FIELD_CLASS}
          >
            <option value="">Todos</option>
            {projectsQuery.data?.items.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-priority" className="text-xs font-medium text-muted-foreground">
            Prioridade
          </label>
          <select
            id="filter-priority"
            value={filters.priority}
            onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
            className={FIELD_CLASS}
          >
            <option value="">Todas</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>
        {view === 'list' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-status" className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Todos</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          Buscar
        </button>
      </form>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground" data-testid="kanban-feedback">
        {feedback}
      </p>

      {tasksQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando tarefas…</p>}
      {tasksQuery.isError && <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar as tarefas.</p>}
      {tasksQuery.data?.nextCursor && (
        <p className="text-xs text-muted-foreground">
          Mostrando as 200 tarefas mais recentes; use os filtros para refinar.
        </p>
      )}
      {tasksQuery.data && tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada com esses filtros.</p>
      )}

      {tasksQuery.data && tasks.length > 0 && view === 'list' && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Tarefa</th>
                <th className="px-4 py-2 font-medium">Projeto</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Prioridade</th>
                <th className="px-4 py-2 font-medium">Atualizada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-muted">
                  <td className="px-4 py-2">
                    <Link href={`/projects/${task.projectId}/tasks/${task.id}`} className="font-medium text-foreground hover:underline">
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <Link href={`/projects/${task.projectId}`} className="hover:underline">
                      {task.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={taskStatusTone(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={taskPriorityTone(task.priority)}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{new Date(task.updatedAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tasksQuery.data && view === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-2" data-testid="kanban-board">
          {STATUSES.map((status) => {
            const column = byStatus.get(status) ?? [];
            return (
              <section
                key={status}
                aria-label={`Coluna ${TASK_STATUS_LABELS[status]}`}
                data-testid={`column-${status}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, status)}
                className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2"
              >
                <header className="flex items-center justify-between px-1 py-1">
                  <h2 className="text-sm font-medium">{TASK_STATUS_LABELS[status]}</h2>
                  <span className="text-xs text-muted-foreground">{column.length}</span>
                </header>
                {column.length === 0 && <p className="px-1 text-xs text-muted-foreground">Sem tarefas</p>}
                {column.map((task) => (
                  <article
                    key={task.id}
                    draggable={mayMove && !task.projectIsProtected}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', task.id);
                      setDraggingId(task.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    data-testid={`card-${task.id}`}
                    className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 shadow-sm"
                  >
                    <Link href={`/projects/${task.projectId}/tasks/${task.id}`} className="text-sm font-medium hover:underline">
                      {task.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">{task.projectName}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={taskPriorityTone(task.priority)}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
                      {task.projectIsProtected && <Badge>Demo</Badge>}
                    </span>
                    {mayMove && !task.projectIsProtected && task.allowedNextStatuses.length > 0 && (
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Mover para
                        <select
                          value=""
                          onChange={(event) => {
                            if (event.target.value) move.mutate({ taskId: task.id, status: event.target.value as TaskStatus });
                          }}
                          aria-label={`Mover "${task.title}" para`}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                        >
                          <option value="">Selecione…</option>
                          {task.allowedNextStatuses.map((next) => (
                            <option key={next} value={next}>
                              {TASK_STATUS_LABELS[next]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
