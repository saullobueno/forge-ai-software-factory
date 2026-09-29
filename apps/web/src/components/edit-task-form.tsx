'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskPriority } from '@forge/types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { TASK_PRIORITY_LABELS } from '@/lib/labels';
import type { ApiTask } from '@/lib/types';

const INPUT_CLASS = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export function EditTaskForm({ task, onDone }: { task: ApiTask; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(task.acceptanceCriteria ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);

  const updateTask = useMutation({
    mutationFn: () =>
      apiFetch<ApiTask>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          priority,
          description: description.trim() ? description : null,
          acceptanceCriteria: acceptanceCriteria.trim() ? acceptanceCriteria : null,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
      void queryClient.invalidateQueries({ queryKey: ['projects', task.projectId, 'tasks'] });
      onDone();
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateTask.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Editar tarefa"
      data-testid="edit-task-form"
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-task-title" className="text-sm font-medium">
          Título
        </label>
        <input
          id="edit-task-title"
          required
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-task-description" className="text-sm font-medium">
          Descrição
        </label>
        <textarea
          id="edit-task-description"
          rows={3}
          maxLength={10000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-task-acceptance" className="text-sm font-medium">
          Critérios de aceite
        </label>
        <textarea
          id="edit-task-acceptance"
          rows={3}
          maxLength={10000}
          value={acceptanceCriteria}
          onChange={(event) => setAcceptanceCriteria(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:w-48">
        <label htmlFor="edit-task-priority" className="text-sm font-medium">
          Prioridade
        </label>
        <select
          id="edit-task-priority"
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

      {updateTask.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {updateTask.error instanceof ApiError ? updateTask.error.message : 'Não foi possível salvar a tarefa.'}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={updateTask.isPending || title.trim().length === 0}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {updateTask.isPending ? 'Salvando…' : 'Salvar alterações'}
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
