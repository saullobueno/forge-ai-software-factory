'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskPriority } from '@forge/types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { TASK_PRIORITY_LABELS } from '@/lib/labels';
import { splitLabels, useUsers } from '@/lib/use-users';
import type { ApiTask } from '@/lib/types';

const INPUT_CLASS = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export function NewTaskForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [labels, setLabels] = useState('');
  const { users } = useUsers();

  const createTask = useMutation({
    mutationFn: () =>
      apiFetch<ApiTask>(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          priority,
          labels: splitLabels(labels),
          ...(assigneeId ? { assigneeId } : {}),
          ...(description.trim() ? { description } : {}),
          ...(acceptanceCriteria.trim() ? { acceptanceCriteria } : {}),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      onDone();
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createTask.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Nova tarefa"
      data-testid="new-task-form"
      className="mt-3 flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="task-title" className="text-sm font-medium">
          Título
        </label>
        <input
          id="task-title"
          required
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="task-description" className="text-sm font-medium">
          Descrição
        </label>
        <textarea
          id="task-description"
          rows={3}
          maxLength={10000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="task-acceptance" className="text-sm font-medium">
          Critérios de aceite
        </label>
        <textarea
          id="task-acceptance"
          rows={3}
          maxLength={10000}
          value={acceptanceCriteria}
          onChange={(event) => setAcceptanceCriteria(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:w-48">
        <label htmlFor="task-priority" className="text-sm font-medium">
          Prioridade
        </label>
        <select
          id="task-priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority)}
          className={INPUT_CLASS}
        >
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {TASK_PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-assignee" className="text-sm font-medium">
            Responsável
          </label>
          <select
            id="task-assignee"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Sem responsável</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-labels" className="text-sm font-medium">
            Etiquetas
          </label>
          <input
            id="task-labels"
            placeholder="backend, urgente"
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {createTask.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {createTask.error instanceof ApiError ? createTask.error.message : 'Não foi possível criar a tarefa.'}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createTask.isPending || title.trim().length === 0}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createTask.isPending ? 'Criando…' : 'Criar tarefa'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
