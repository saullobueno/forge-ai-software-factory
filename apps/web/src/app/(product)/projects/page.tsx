'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Breadcrumb } from '@/components/breadcrumb';
import { NewProjectForm } from '@/components/new-project-form';
import { apiFetch } from '@/lib/api-client';
import { canCreateProject } from '@/lib/project-permissions';
import type { ApiCurrentUser, ApiProject, Paginated } from '@/lib/types';

function techProfileSummary(project: ApiProject): string {
  const parts = [...project.techProfile.languages, ...project.techProfile.frameworks];
  return parts.length > 0 ? parts.join(' · ') : 'Sem perfil tecnológico definido';
}

export default function ProjectsPage() {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Paginated<ApiProject>>('/projects'),
  });
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<ApiCurrentUser>('/auth/me'),
  });
  const canCreate = currentUserQuery.data !== undefined && canCreateProject(currentUserQuery.data.role);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Projetos' }]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Projetos da sua organização no Forge.</p>
        </div>
        {canCreate && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Novo projeto
          </button>
        )}
      </div>

      {canCreate && creating && <NewProjectForm onCancel={() => setCreating(false)} />}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando projetos…</p>}
      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar os projetos.</p>
      )}

      {data && data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum projeto encontrado ainda.</p>
      )}

      {data && data.items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((project) => (
            <li key={project.id} className="rounded-lg border border-border p-4 transition-colors hover:bg-muted">
              <Link href={`/projects/${project.id}`} className="block">
                <h2 className="font-medium text-foreground">{project.name}</h2>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{project.slug}</p>
                <p className="mt-2 text-sm text-muted-foreground">{techProfileSummary(project)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
