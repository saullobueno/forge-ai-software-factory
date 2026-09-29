'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ApiProject } from '@/lib/types';

const INPUT_CLASS = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function nullIfBlank(value: string): string | null {
  return value.trim().length > 0 ? value : null;
}

export function EditProjectForm({ project, onDone }: { project: ApiProject; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [languages, setLanguages] = useState(project.techProfile.languages.join(', '));
  const [frameworks, setFrameworks] = useState(project.techProfile.frameworks.join(', '));
  const [packageManager, setPackageManager] = useState(project.techProfile.packageManager ?? '');
  const [architectureNotes, setArchitectureNotes] = useState(project.architectureNotes ?? '');
  const [codeRules, setCodeRules] = useState(project.codeRules ?? '');

  const updateProject = useMutation({
    mutationFn: () =>
      apiFetch<ApiProject>(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          description: nullIfBlank(description),
          languages: splitList(languages),
          frameworks: splitList(frameworks),
          packageManager: nullIfBlank(packageManager),
          architectureNotes: nullIfBlank(architectureNotes),
          codeRules: nullIfBlank(codeRules),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      onDone();
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateProject.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Editar projeto"
      data-testid="edit-project-form"
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-project-name" className="text-sm font-medium">
          Nome
        </label>
        <input
          id="edit-project-name"
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-project-description" className="text-sm font-medium">
          Descrição
        </label>
        <textarea
          id="edit-project-description"
          rows={3}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-project-languages" className="text-sm font-medium">
            Linguagens
          </label>
          <input
            id="edit-project-languages"
            value={languages}
            onChange={(event) => setLanguages(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-project-frameworks" className="text-sm font-medium">
            Frameworks
          </label>
          <input
            id="edit-project-frameworks"
            value={frameworks}
            onChange={(event) => setFrameworks(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-project-package-manager" className="text-sm font-medium">
            Gerenciador de pacotes
          </label>
          <input
            id="edit-project-package-manager"
            value={packageManager}
            onChange={(event) => setPackageManager(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-project-architecture" className="text-sm font-medium">
          Notas de arquitetura
        </label>
        <textarea
          id="edit-project-architecture"
          rows={3}
          maxLength={10000}
          value={architectureNotes}
          onChange={(event) => setArchitectureNotes(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-project-rules" className="text-sm font-medium">
          Regras de código
        </label>
        <textarea
          id="edit-project-rules"
          rows={3}
          maxLength={10000}
          value={codeRules}
          onChange={(event) => setCodeRules(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      {updateProject.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {updateProject.error instanceof ApiError ? updateProject.error.message : 'Não foi possível salvar o projeto.'}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={updateProject.isPending || name.trim().length === 0}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {updateProject.isPending ? 'Salvando…' : 'Salvar alterações'}
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
