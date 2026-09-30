'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { AgentRunStatus } from '@forge/types';
import Link from 'next/link';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import { AGENT_RUN_STATUS_LABELS } from '@/lib/labels';
import { agentRunStatusTone } from '@/lib/status-tone';
import type { ApiAgentRunListItem, ApiProject, Paginated } from '@/lib/types';

const STATUSES: AgentRunStatus[] = [
  'queued',
  'planning',
  'executing',
  'testing',
  'review',
  'approval_required',
  'completed',
  'failed',
  'cancelled',
];
const FIELD_CLASS = 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

function formatCost(value: string): string {
  return `US$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
}

export default function AgentRunsPage() {
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');

  const runsQuery = useInfiniteQuery({
    queryKey: ['agent-runs', 'global', { projectId, status }],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (projectId) params.set('projectId', projectId);
      if (status) params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<Paginated<ApiAgentRunListItem>>(`/agent-runs?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Paginated<ApiProject>>('/projects'),
  });

  const runs = runsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Execuções de IA' }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Execuções de IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas as execuções de agentes da organização, das mais recentes para as mais antigas.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filtros de execuções">
        <div className="flex flex-col gap-1">
          <label htmlFor="runs-project" className="text-xs font-medium text-muted-foreground">
            Projeto
          </label>
          <select id="runs-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className={FIELD_CLASS}>
            <option value="">Todos</option>
            {projectsQuery.data?.items.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="runs-status" className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select id="runs-status" value={status} onChange={(event) => setStatus(event.target.value)} className={FIELD_CLASS}>
            <option value="">Todos</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {AGENT_RUN_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {runsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando execuções…</p>}
      {runsQuery.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar as execuções.</p>
      )}
      {runsQuery.data && runs.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma execução encontrada com esses filtros.</p>
      )}

      {runs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm" data-testid="runs-table">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Execução</th>
                <th className="px-4 py-2 font-medium">Projeto</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
                <th className="px-4 py-2 text-right font-medium">Custo</th>
                <th className="px-4 py-2 font-medium">Disparada por</th>
                <th className="px-4 py-2 font-medium">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-muted">
                  <td className="px-4 py-2">
                    <Link
                      href={`/projects/${run.projectId}/tasks/${run.taskId}/runs/${run.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {run.objective}
                    </Link>
                    <p className="text-xs text-muted-foreground">{run.taskTitle}</p>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <Link href={`/projects/${run.projectId}`} className="hover:underline">
                      {run.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={agentRunStatusTone(run.status)}>{AGENT_RUN_STATUS_LABELS[run.status]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{run.totalTokens.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{formatCost(run.totalCostUsd)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{run.requestedByName ?? '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{new Date(run.createdAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {runsQuery.hasNextPage && (
        <button
          type="button"
          onClick={() => void runsQuery.fetchNextPage()}
          disabled={runsQuery.isFetchingNextPage}
          className="self-start rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {runsQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
