'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import type { ApiAiUsageSummary } from '@/lib/types';

function formatInteger(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export default function AiUsagePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-usage-summary'],
    queryFn: () => apiFetch<ApiAiUsageSummary>('/ai-usage/summary'),
  });

  const metricItems = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Custo estimado', value: formatUsd(data.totals.costUsd) },
      { label: 'Tokens totais', value: formatInteger(data.totals.totalTokens) },
      { label: 'Chamadas', value: formatInteger(data.totals.callCount) },
      { label: 'Amostra', value: formatInteger(data.sampleSize) },
    ];
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Uso IA' }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Uso IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tokens, custo estimado e provedores usados nas execuções da organização.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando uso de IA...</p>}
      {isError && <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar o uso de IA.</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Por provedor e modelo</h2>
                <Badge>{data.byProvider.length} grupos</Badge>
              </div>
              {data.byProvider.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum uso de IA registrado ainda.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Provider</th>
                        <th className="px-3 py-2 font-medium">Modelo</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens</th>
                        <th className="px-3 py-2 text-right font-medium">Custo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.byProvider.map((item) => (
                        <tr key={`${item.provider}-${item.model}`}>
                          <td className="px-3 py-3">
                            <Badge>{item.provider}</Badge>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">{item.model}</td>
                          <td className="px-3 py-3 text-right font-mono text-xs">
                            {formatInteger(item.totalTokens)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs">{formatUsd(item.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Eventos recentes</h2>
                <Badge>{data.recent.length} registros</Badge>
              </div>
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma chamada recente para listar.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Quando</th>
                        <th className="px-3 py-2 font-medium">Modelo</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens</th>
                        <th className="px-3 py-2 text-right font-medium">Custo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recent.map((item) => (
                        <tr key={item.id}>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </td>
                          <td className="px-3 py-3">
                            <Badge>{item.provider}</Badge>
                            <span className="mt-1 block font-mono text-xs">{item.model}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs">
                            {formatInteger(item.totalTokens)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs">{formatUsd(item.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
