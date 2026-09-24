'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import {
  DEPLOYMENT_STATUS_LABELS,
  ENVIRONMENT_KIND_LABELS,
  KNOWLEDGE_SOURCE_KIND_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/labels';
import { deploymentStatusTone, taskPriorityTone, taskStatusTone } from '@/lib/status-tone';
import type {
  ApiCurrentUser,
  ApiDeploymentSummary,
  ApiEnvironment,
  ApiKnowledgeSearchResult,
  ApiKnowledgeSourceSummary,
  ApiProject,
  ApiTask,
} from '@/lib/types';

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => apiFetch<ApiProject>(`/projects/${projectId}`),
  });

  const tasksQuery = useQuery({
    queryKey: ['projects', projectId, 'tasks'],
    queryFn: () => apiFetch<ApiTask[]>(`/projects/${projectId}/tasks`),
  });

  const environmentsQuery = useQuery({
    queryKey: ['projects', projectId, 'environments'],
    queryFn: () => apiFetch<ApiEnvironment[]>(`/projects/${projectId}/environments`),
  });

  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<ApiCurrentUser>('/auth/me'),
  });

  const requestDeployment = useMutation({
    mutationFn: (environmentId: string) =>
      apiFetch<ApiDeploymentSummary>(`/projects/${projectId}/environments/${environmentId}/deployments`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'environments'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });

  if (projectQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando projeto…</p>;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar este projeto.</p>;
  }

  const project = projectQuery.data;
  const techParts = [...project.techProfile.languages, ...project.techProfile.frameworks];
  const canRequestDeployment =
    currentUserQuery.data?.role === 'admin' || currentUserQuery.data?.role === 'platform_engineer';
  const pendingDeploymentEnvironmentId = requestDeployment.isPending ? requestDeployment.variables : null;

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

      <KnowledgePanel projectId={projectId} />

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

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Ambientes</h2>
          <span className="font-mono text-xs text-muted-foreground">deployments e saúde</span>
        </div>

        {environmentsQuery.isLoading && (
          <p className="mt-2 text-sm text-muted-foreground">Carregando ambientes…</p>
        )}
        {environmentsQuery.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Não foi possível carregar os ambientes.</p>
        )}
        {requestDeployment.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Não foi possível solicitar o deployment.</p>
        )}
        {environmentsQuery.data && environmentsQuery.data.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum ambiente configurado para este projeto.</p>
        )}

        {environmentsQuery.data && environmentsQuery.data.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {environmentsQuery.data.map((environment) => {
              const latestDeployment = environment.deployments[0];
              const hasPendingApproval = latestDeployment?.latestApproval?.status === 'pending';
              const isRequestingThisEnvironment = pendingDeploymentEnvironmentId === environment.id;

              return (
                <li key={environment.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{environment.name}</span>
                        <Badge>{ENVIRONMENT_KIND_LABELS[environment.kind]}</Badge>
                        {environment.isProtected && <Badge tone="attention">Protegido</Badge>}
                        {hasPendingApproval && <Badge tone="attention">Aguardando aprovação</Badge>}
                      </div>
                      {canRequestDeployment && (
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={requestDeployment.isPending || hasPendingApproval}
                          onClick={() => requestDeployment.mutate(environment.id)}
                        >
                          {isRequestingThisEnvironment ? 'Solicitando…' : 'Solicitar deploy'}
                        </button>
                      )}
                    </div>
                    {environment.url ? (
                      <a
                        href={environment.url}
                        className="mt-1 block truncate font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        {environment.url}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">Sem URL registrada.</p>
                    )}
                  </div>

                  <div className="min-w-0 rounded-md border border-border bg-muted/30 p-3">
                    {latestDeployment ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={deploymentStatusTone(latestDeployment.status)}>
                            {hasPendingApproval ? 'Aguardando aprovação' : DEPLOYMENT_STATUS_LABELS[latestDeployment.status]}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {latestDeployment.commitSha.slice(0, 12)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {latestDeployment.pullRequest
                            ? `PR #${latestDeployment.pullRequest.externalNumber ?? 'local'} · ${latestDeployment.pullRequest.title}`
                            : 'Deployment sem pull request associado.'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {latestDeployment.deployedByUser
                            ? `Por ${latestDeployment.deployedByUser.name}`
                            : 'Autor não registrado'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum deployment registrado.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function KnowledgePanel({ projectId }: { projectId: string }) {
  const [searchInput, setSearchInput] = useState('arquitetura');
  const [submittedQuery, setSubmittedQuery] = useState('arquitetura');

  const sourcesQuery = useQuery({
    queryKey: ['projects', projectId, 'knowledge'],
    queryFn: () => apiFetch<ApiKnowledgeSourceSummary[]>(`/projects/${projectId}/knowledge`),
  });

  const searchQuery = useQuery({
    queryKey: ['projects', projectId, 'knowledge', 'search', submittedQuery],
    queryFn: () =>
      apiFetch<ApiKnowledgeSearchResult[]>(
        `/projects/${projectId}/knowledge/search?q=${encodeURIComponent(submittedQuery)}&limit=5`,
      ),
    enabled: submittedQuery.length > 0,
  });

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    if (nextQuery.length === 0) return;
    setSubmittedQuery(nextQuery);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Conhecimento</h2>
        <span className="font-mono text-xs text-muted-foreground">fontes indexadas e busca contextual</span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">Fontes</h3>

          {sourcesQuery.isLoading && <p className="mt-2 text-sm text-muted-foreground">Carregando fontes…</p>}
          {sourcesQuery.isError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">Não foi possível carregar o conhecimento.</p>
          )}
          {sourcesQuery.data && sourcesQuery.data.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma fonte indexada para este projeto.</p>
          )}

          {sourcesQuery.data && sourcesQuery.data.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {sourcesQuery.data.map((source) => (
                <li key={source.id} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{KNOWLEDGE_SOURCE_KIND_LABELS[source.kind]}</Badge>
                    {source.riskyChunkCount > 0 && <Badge tone="attention">Risco detectado</Badge>}
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{source.title}</p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{source.uri}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {source.chunkCount} chunks · {source.totalTokens} tokens estimados
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="knowledge-search">
              Buscar conhecimento
            </label>
            <input
              id="knowledge-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground"
              placeholder="Buscar arquitetura, deploy, regras..."
            />
            <button
              type="submit"
              className="min-h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Buscar
            </button>
          </form>

          {searchQuery.isLoading && <p className="mt-3 text-sm text-muted-foreground">Buscando…</p>}
          {searchQuery.isError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">Não foi possível buscar conhecimento.</p>
          )}
          {searchQuery.data && searchQuery.data.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">Nenhum trecho encontrado para “{submittedQuery}”.</p>
          )}

          {searchQuery.data && searchQuery.data.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {searchQuery.data.map((result) => (
                <li key={`${result.sourceId}-${result.chunkIndex}`} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{KNOWLEDGE_SOURCE_KIND_LABELS[result.kind]}</Badge>
                    <Badge>score {result.score}</Badge>
                    {result.hasPromptInjectionRisk && <Badge tone="attention">Não confiável</Badge>}
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{result.title}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {result.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
