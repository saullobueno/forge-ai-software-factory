'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AIPlaygroundDatasetItem, AIPlaygroundModelId } from '@forge/types';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ApiAIPlaygroundConfig, ApiAIPlaygroundEvaluation } from '@/lib/types';

const FALLBACK_MODELS: ApiAIPlaygroundConfig['models'] = [
  {
    id: 'forge-mock-fast',
    provider: 'mock',
    name: 'Forge Mock Fast',
    description: 'Baixa latência para triagem e prompts curtos.',
    inputCostPerMillionTokensUsd: 0.2,
    outputCostPerMillionTokensUsd: 0.8,
  },
  {
    id: 'forge-mock-balanced',
    provider: 'mock',
    name: 'Forge Mock Balanced',
    description: 'Equilíbrio entre qualidade, custo e aderência a JSON.',
    inputCostPerMillionTokensUsd: 0.8,
    outputCostPerMillionTokensUsd: 3,
  },
];

const FALLBACK_DATASET: AIPlaygroundDatasetItem[] = [
  {
    id: 'refund-bug',
    title: 'Bug de estorno',
    input: 'Cliente relata que estornos aparecem como cobrança positiva na fatura.',
    expectedKeywords: ['estorno', 'sinal', 'teste'],
  },
  {
    id: 'deploy-risk',
    title: 'Risco de deploy',
    input: 'Resumo de PR altera cálculo financeiro e será publicado em produção protegida.',
    expectedKeywords: ['produção', 'aprovação', 'rollback'],
  },
];

const DEFAULT_PROMPT = 'Responda em JSON com decision, summary, evidence e gaps. Seja direto e cite riscos de engenharia.';

function formatDataset(dataset: readonly AIPlaygroundDatasetItem[]): string {
  return JSON.stringify(dataset, null, 2);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(value);
}

function parseDataset(value: string): AIPlaygroundDatasetItem[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Dataset precisa ser uma lista.');
  return parsed.map((item) => {
    if (item === null || typeof item !== 'object') throw new Error('Cada caso precisa ser um objeto.');
    const record = item as Record<string, unknown>;
    const expectedKeywords = Array.isArray(record.expectedKeywords)
      ? record.expectedKeywords.filter((keyword): keyword is string => typeof keyword === 'string')
      : [];
    if (typeof record.id !== 'string' || typeof record.title !== 'string' || typeof record.input !== 'string') {
      throw new Error('Cada caso precisa ter id, title e input.');
    }
    return {
      id: record.id,
      title: record.title,
      input: record.input,
      expectedKeywords,
    };
  });
}

export default function AIPlaygroundPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [datasetText, setDatasetText] = useState(() => formatDataset(FALLBACK_DATASET));
  const [selectedModels, setSelectedModels] = useState<AIPlaygroundModelId[]>([
    'forge-mock-fast',
    'forge-mock-balanced',
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ['ai-playground', 'config'],
    queryFn: () => apiFetch<ApiAIPlaygroundConfig>('/ai-playground/config'),
  });

  const models = configQuery.data?.models ?? FALLBACK_MODELS;

  const evaluation = useMutation({
    mutationFn: (dataset: AIPlaygroundDatasetItem[]) =>
      apiFetch<ApiAIPlaygroundEvaluation>('/ai-playground/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          models: selectedModels,
          dataset,
          requireStructuredOutput: true,
        }),
      }),
  });

  const winnerName = useMemo(() => {
    const winnerId = evaluation.data?.winner;
    return models.find((model) => model.id === winnerId)?.name ?? winnerId ?? null;
  }, [evaluation.data?.winner, models]);

  const handleRun = () => {
    setFormError(null);
    if (selectedModels.length === 0) {
      setFormError('Selecione ao menos um modelo.');
      return;
    }

    try {
      evaluation.mutate(parseDataset(datasetText));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Dataset inválido.');
    }
  };

  const toggleModel = (modelId: AIPlaygroundModelId) => {
    setSelectedModels((current) =>
      current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId],
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Playground IA' }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playground IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comparação controlada de modelos para prompts do Forge.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              className="min-h-32 resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-foreground"
            />
          </label>

          <div>
            <span className="text-sm font-medium">Modelos</span>
            <div className="mt-2 grid gap-2">
              {models.map((model) => (
                <label
                  key={model.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="mt-1 size-4 accent-foreground"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{model.name}</span>
                      <Badge>{model.provider}</Badge>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{model.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm font-medium">Dataset</span>
            <textarea
              value={datasetText}
              onChange={(event) => setDatasetText(event.target.value)}
              rows={14}
              spellCheck={false}
              className="min-h-72 flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none transition-colors focus:border-foreground"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-5 text-sm">
              {formError && <span className="text-red-600 dark:text-red-400">{formError}</span>}
              {evaluation.error && (
                <span className="text-red-600 dark:text-red-400">
                  {evaluation.error instanceof ApiError
                    ? evaluation.error.message
                    : 'Não foi possível comparar os modelos.'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={evaluation.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {evaluation.isPending ? 'Comparando…' : 'Comparar modelos'}
            </button>
          </div>
        </div>
      </section>

      {configQuery.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar a configuração do playground.</p>
      )}

      {evaluation.data && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Scorecard</h2>
            {winnerName && (
              <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                Vencedor: <span className="font-medium text-foreground">{winnerName}</span>
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Modelo</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Latência</th>
                  <th className="px-3 py-2 font-medium">Tokens</th>
                  <th className="px-3 py-2 font-medium">Custo</th>
                  <th className="px-3 py-2 font-medium">JSON válido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {evaluation.data.results.map((result) => (
                  <tr key={result.model.id}>
                    <td className="px-3 py-3 font-medium">{result.model.name}</td>
                    <td className="px-3 py-3 font-mono">{Math.round(result.averageScore * 100)}%</td>
                    <td className="px-3 py-3 font-mono">{result.averageLatencyMs} ms</td>
                    <td className="px-3 py-3 font-mono">{result.totalTokens}</td>
                    <td className="px-3 py-3 font-mono">{formatUsd(result.totalCostUsd)}</td>
                    <td className="px-3 py-3 font-mono">{Math.round(result.structuredValidityRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {evaluation.data.results.flatMap((result) =>
              result.cases.map((testCase) => (
                <article key={`${result.model.id}-${testCase.datasetItemId}`} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{result.model.name}</h3>
                    <Badge tone={testCase.structuredOutputValid ? 'positive' : 'attention'}>
                      {testCase.structuredOutputValid ? 'JSON válido' : 'Texto livre'}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {testCase.datasetItemId} · {Math.round(testCase.score * 100)}%
                    </span>
                  </div>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                    {testCase.output}
                  </pre>
                </article>
              )),
            )}
          </div>
        </section>
      )}
    </div>
  );
}
