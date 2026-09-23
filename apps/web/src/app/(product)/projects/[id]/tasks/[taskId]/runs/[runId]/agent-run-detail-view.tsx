'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentRunStatus } from '@forge/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { isAgentRunCancelable } from '@/lib/agent-run-cancelable';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  AGENT_ROLE_LABELS,
  AGENT_RUN_STATUS_LABELS,
  AGENT_STEP_STATUS_LABELS,
  FINDING_SEVERITY_LABELS,
  FINDING_STATUS_LABELS,
  TEST_ARTIFACT_KIND_LABELS,
  TOOL_CALL_STATUS_LABELS,
} from '@/lib/labels';
import { parseReviewerFindings } from '@/lib/reviewer-findings';
import {
  agentRunStatusTone,
  agentStepStatusTone,
  findingSeverityTone,
  toolCallStatusTone,
} from '@/lib/status-tone';
import type {
  ApiAgentRunDetail,
  ApiAgentStep,
  ApiArtifactContent,
  ApiProject,
  ApiTask,
  ApiTestArtifact,
} from '@/lib/types';

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '—';
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}s`;
}

function StepDetails({ step }: { step: ApiAgentStep }) {
  const findings = step.role === 'reviewer' ? parseReviewerFindings(step.output) : null;

  return (
    <div className="flex flex-col gap-3 border-t border-border p-3 text-sm">
      <div>
        <h4 className="text-xs font-medium text-muted-foreground">Entrada</h4>
        <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
          {JSON.stringify(step.input, null, 2)}
        </pre>
      </div>

      {findings ? (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Findings da revisão</h4>
          <ul className="mt-1 flex flex-col gap-2">
            {findings.map((finding) => (
              <li key={finding.id} className="rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={findingSeverityTone(finding.severity)}>
                    {FINDING_SEVERITY_LABELS[finding.severity]}
                  </Badge>
                  <Badge tone="neutral">{FINDING_STATUS_LABELS[finding.status]}</Badge>
                  <span className="font-medium text-foreground">{finding.title}</span>
                </div>
                <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                  {finding.file}:{finding.line}
                </p>
                <p className="mt-1.5 text-foreground">{finding.explanation}</p>
                <p className="mt-1.5 text-muted-foreground">
                  <span className="font-medium text-foreground">Evidência: </span>
                  {finding.evidence}
                </p>
                <p className="mt-1.5 text-muted-foreground">
                  <span className="font-medium text-foreground">Remediação sugerida: </span>
                  {finding.suggestedRemediation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        step.output !== null && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground">Saída</h4>
            <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
              {JSON.stringify(step.output, null, 2)}
            </pre>
          </div>
        )
      )}

      <div>
        <h4 className="text-xs font-medium text-muted-foreground">
          Tool calls {step.toolCalls.length > 0 && `(${step.toolCalls.length})`}
        </h4>
        {step.toolCalls.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Nenhuma tool call registrada.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1.5">
            {step.toolCalls.map((toolCall) => (
              <li key={toolCall.id} className="rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-medium text-foreground">{toolCall.toolName}</span>
                  <Badge tone={toolCallStatusTone(toolCall.status)}>
                    {TOOL_CALL_STATUS_LABELS[toolCall.status]}
                  </Badge>
                </div>
                <pre className="mt-1.5 overflow-auto rounded bg-muted p-1.5 text-xs">
                  {JSON.stringify({ arguments: toolCall.arguments, result: toolCall.result }, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: ApiAgentStep }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-lg border border-border" data-testid="agent-step">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{AGENT_ROLE_LABELS[step.role]}</span>
            <Badge tone={agentStepStatusTone(step.status)}>{AGENT_STEP_STATUS_LABELS[step.status]}</Badge>
          </div>
          <span className="truncate text-xs text-muted-foreground">{step.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span>{formatDuration(step.durationMs)}</span>
          <span>{step.tokens.toLocaleString('pt-BR')} tokens</span>
          <span>${Number(step.costUsd).toFixed(4)}</span>
          <span aria-hidden>{expanded ? '▾' : '▸'}</span>
        </div>
      </button>
      {expanded && <StepDetails step={step} />}
    </li>
  );
}

function ArtifactRow({ artifact }: { artifact: ApiTestArtifact }) {
  const [expanded, setExpanded] = useState(false);

  const contentQuery = useQuery({
    queryKey: ['artifacts', artifact.id, 'content'],
    queryFn: () => apiFetch<ApiArtifactContent>(`/artifacts/${artifact.id}/content`),
    enabled: expanded,
  });

  return (
    <li className="rounded-md border border-border p-2" data-testid="artifact-row">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge tone="neutral">{TEST_ARTIFACT_KIND_LABELS[artifact.kind]}</Badge>
          <span className="font-mono text-xs text-foreground">{artifact.name}</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {expanded ? 'Ocultar conteúdo' : 'Ver conteúdo'}
        </button>
      </div>
      {expanded && (
        <div className="mt-2">
          {contentQuery.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {contentQuery.isError && (
            <p className="text-xs text-red-600 dark:text-red-400">Não foi possível carregar este artefato.</p>
          )}
          {contentQuery.data && (
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs" data-testid="artifact-content">
              {contentQuery.data.content}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

export function AgentRunDetailView({
  projectId,
  taskId,
  runId,
}: {
  projectId: string;
  taskId: string;
  runId: string;
}) {
  const queryClient = useQueryClient();
  const [liveStatus, setLiveStatus] = useState<AgentRunStatus | null>(null);

  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => apiFetch<ApiProject>(`/projects/${projectId}`),
  });

  const taskQuery = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => apiFetch<ApiTask>(`/tasks/${taskId}`),
  });

  const runQuery = useQuery({
    queryKey: ['agent-runs', runId],
    queryFn: () => apiFetch<ApiAgentRunDetail>(`/agent-runs/${runId}`),
  });

  const artifactsQuery = useQuery({
    queryKey: ['agent-runs', runId, 'artifacts'],
    queryFn: () => apiFetch<ApiTestArtifact[]>(`/agent-runs/${runId}/artifacts`),
  });

  // Canal de tempo real (spec §9 — "transmitir logs e status via
  // WebSockets/SSE"): abre uma conexão SSE same-origin (o cookie httpOnly
  // de sessão viaja automaticamente, mesmo raciocínio de `apiFetch`) que
  // emite o status vigente na conexão e qualquer mudança subsequente — ex.:
  // um cancelamento disparado por esta mesma aba OU por outra. Atualiza o
  // badge via estado local (sem esperar um refetch) e invalida a query de
  // detalhe para o resto da página (steps, etc.) acompanhar.
  useEffect(() => {
    const source = new EventSource(`/api/agent-runs/${runId}/events`, { withCredentials: true });

    source.onmessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { status: AgentRunStatus };
        setLiveStatus(payload.status);
        void queryClient.invalidateQueries({ queryKey: ['agent-runs', runId] });
      } catch {
        // Evento SSE malformado — ignora, o próximo evento (ou o refetch
        // normal do TanStack Query) mantém a UI consistente.
      }
    };

    return () => source.close();
  }, [runId, queryClient]);

  const cancelRun = useMutation({
    mutationFn: () => apiFetch<ApiAgentRunDetail>(`/agent-runs/${runId}/cancel`, { method: 'POST' }),
    onSuccess: (data) => {
      setLiveStatus(data.status);
      void queryClient.invalidateQueries({ queryKey: ['agent-runs', runId] });
    },
  });

  if (runQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando execução…</p>;
  }

  if (runQuery.isError || !runQuery.data) {
    return <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar esta execução.</p>;
  }

  const run = runQuery.data;
  const currentStatus = liveStatus ?? run.status;
  const projectName = projectQuery.data?.name ?? '…';
  const taskTitle = taskQuery.data?.title ?? '…';
  const artifacts = artifactsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: 'Projetos', href: '/projects' },
          { label: projectName, href: `/projects/${projectId}` },
          { label: taskTitle, href: `/projects/${projectId}/tasks/${taskId}` },
          { label: 'Execução de IA' },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Execução de IA</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{run.objective}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge tone={agentRunStatusTone(currentStatus)}>
            <span data-testid="run-status">{AGENT_RUN_STATUS_LABELS[currentStatus]}</span>
          </Badge>
          {isAgentRunCancelable(currentStatus) && (
            <button
              type="button"
              onClick={() => cancelRun.mutate()}
              disabled={cancelRun.isPending}
              className="rounded-md border border-red-600/40 px-3 py-1.5 text-sm font-medium text-red-700 transition-opacity hover:opacity-80 disabled:opacity-60 dark:border-red-400/40 dark:text-red-400"
            >
              {cancelRun.isPending ? 'Cancelando…' : 'Cancelar execução'}
            </button>
          )}
        </div>
      </div>

      {cancelRun.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {cancelRun.error instanceof ApiError ? cancelRun.error.message : 'Não foi possível cancelar a execução.'}
        </p>
      )}

      <section className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-border p-3">
          <h2 className="text-xs font-medium text-muted-foreground">Tokens totais</h2>
          <p className="mt-1 text-lg font-semibold">{run.totalTokens.toLocaleString('pt-BR')}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <h2 className="text-xs font-medium text-muted-foreground">Custo estimado</h2>
          <p className="mt-1 text-lg font-semibold">${Number(run.totalCostUsd).toFixed(4)}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <h2 className="text-xs font-medium text-muted-foreground">Etapas</h2>
          <p className="mt-1 text-lg font-semibold">{run.steps.length}</p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium">Linha do tempo</h2>
        {run.steps.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Esta execução ainda não tem nenhuma etapa registrada.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {run.steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium">Artefatos</h2>
        {artifactsQuery.isLoading && <p className="mt-2 text-sm text-muted-foreground">Carregando artefatos…</p>}
        {artifacts.length === 0 && !artifactsQuery.isLoading && (
          <p className="mt-2 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum artefato gerado por esta execução ainda.
          </p>
        )}
        {artifacts.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {artifacts.map((artifact) => (
              <ArtifactRow key={artifact.id} artifact={artifact} />
            ))}
          </ul>
        )}
      </section>

      <Link
        href={`/projects/${projectId}/tasks/${taskId}`}
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Voltar para a tarefa
      </Link>
    </div>
  );
}
