'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ApiProject } from '@/lib/types';

const INPUT_CLASS = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [languages, setLanguages] = useState('');
  const [frameworks, setFrameworks] = useState('');
  const [packageManager, setPackageManager] = useState('');

  const createProject = useMutation({
    mutationFn: () =>
      apiFetch<ApiProject>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          ...(description.trim() ? { description } : {}),
          languages: splitList(languages),
          frameworks: splitList(frameworks),
          ...(packageManager.trim() ? { packageManager } : {}),
        }),
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.push(`/projects/${project.id}`);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createProject.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Novo projeto"
      data-testid="new-project-form"
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="project-name" className="text-sm font-medium">
          Nome
        </label>
        <input
          id="project-name"
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="project-description" className="text-sm font-medium">
          Descrição
        </label>
        <textarea
          id="project-description"
          rows={3}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-languages" className="text-sm font-medium">
            Linguagens
          </label>
          <input
            id="project-languages"
            placeholder="typescript, python"
            value={languages}
            onChange={(event) => setLanguages(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-frameworks" className="text-sm font-medium">
            Frameworks
          </label>
          <input
            id="project-frameworks"
            placeholder="next.js, nestjs"
            value={frameworks}
            onChange={(event) => setFrameworks(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-package-manager" className="text-sm font-medium">
            Gerenciador de pacotes
          </label>
          <input
            id="project-package-manager"
            placeholder="pnpm"
            value={packageManager}
            onChange={(event) => setPackageManager(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O projeto é vinculado ao repositório de demonstração (acme-platform-web), usado pelo explorador de código, pelo
        conhecimento e pelas execuções de IA.
      </p>

      {createProject.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {createProject.error instanceof ApiError ? createProject.error.message : 'Não foi possível criar o projeto.'}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createProject.isPending || name.trim().length === 0}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createProject.isPending ? 'Criando…' : 'Criar projeto'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
