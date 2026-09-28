'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import type { ApiPendingApproval } from '@/lib/types';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

/**
 * Link de destino de cada item (Fase 17 continuação #2). `agent_run` tem
 * uma página de detalhe dedicada; `deployment` não tem (ver o comentário
 * de "Decisão sobre SSE vs. refetch simples" na Fase 11 continuação #2 em
 * `PROGRESS.md` — a decisão de deploy é uma badge na tela do projeto, não
 * uma página própria), então o link vai para a página do projeto, onde o
 * card do ambiente com o gate pendente já vive.
 */
function targetHref(item: ApiPendingApproval): string {
  if (item.subjectType === 'agent_run') {
    return `/projects/${item.projectId}/tasks/${item.taskId}/runs/${item.agentRunId}`;
  }
  return `/projects/${item.projectId}`;
}

function subjectLabel(item: ApiPendingApproval): string {
  return item.subjectType === 'agent_run' ? 'Execução de IA' : 'Deployment';
}

function subjectSummary(item: ApiPendingApproval): string {
  if (item.subjectType === 'agent_run') {
    return item.taskTitle;
  }
  return `${item.environmentName} · ${item.projectName}`;
}

export default function ApprovalsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => apiFetch<ApiPendingApproval[]>('/approvals/pending'),
  });

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Aprovações' }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aprovações pendentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Execuções de IA e deployments aguardando uma decisão humana, de todos os projetos da organização.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando aprovações pendentes...</p>}
      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar as aprovações pendentes.
        </p>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente no momento.</p>
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-card p-4">
              <Link href={targetHref(item)} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone="attention">{subjectLabel(item)}</Badge>
                    <span className="truncate text-sm font-medium">{subjectSummary(item)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solicitado em {formatDate(item.createdAt)}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </p>
                </div>
                <span className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                  Ver e decidir
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
