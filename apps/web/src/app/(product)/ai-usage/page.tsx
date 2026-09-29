'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import type { ApiAiProviderConfig, ApiAiUsageSummary, ApiAiUserUsageSummary } from '@/lib/types';

const PROVIDER_LABEL: Record<ApiAiProviderConfig['provider'], string> = {
  mock: 'Mock (sem rede)',
  gemini: 'Gemini',
  groq: 'Groq',
  anthropic: 'Anthropic',
};

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

function formatDuration(value: number | null): string {
  if (value === null) return '-';
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function formatPercent(usage: number, limit: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(
    Math.min(usage / limit, 1),
  );
}

export default function AiUsagePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-usage-summary'],
    queryFn: () => apiFetch<ApiAiUsageSummary>('/ai-usage/summary'),
  });

  // Uso do próprio usuário autenticado (Fase 13 continuação #7) — consulta
  // independente de `/ai-usage/summary`: não exige `audit_log:read`, então
  // carrega mesmo para papéis (ex. `developer`) que não veem o agregado da
  // organização acima.
  const { data: myUsage, isLoading: isMyUsageLoading } = useQuery({
    queryKey: ['ai-usage-me'],
    queryFn: () => apiFetch<ApiAiUserUsageSummary>('/ai-usage/me'),
  });

  // Provider/modelo REALMENTE configurado no processo da API (Fase 13, "UI
  // operacional para selecionar provider/modelo") — mesma consulta
  // independente, sem `audit_log:read`, visível para qualquer usuário
  // autenticado (ver `AiUsageController.providerConfig`).
  const { data: providerConfig } = useQuery({
    queryKey: ['ai-usage-provider-config'],
    queryFn: () => apiFetch<ApiAiProviderConfig>('/ai-usage/provider-config'),
  });

  const myUsageItems = useMemo(() => {
    if (!myUsage) return [];
    const items: { label: string; value: string }[] = [
      { label: 'Custo estimado', value: formatUsd(myUsage.totals.costUsd) },
      { label: 'Tokens totais', value: formatInteger(myUsage.totals.totalTokens) },
      { label: 'Chamadas', value: formatInteger(myUsage.totals.callCount) },
    ];
    if (myUsage.limits.dailyTokenLimit !== null) {
      items.push({
        label: 'Limite de tokens/dia',
        value: `${formatInteger(myUsage.totals.totalTokens)} / ${formatInteger(myUsage.limits.dailyTokenLimit)} (${formatPercent(myUsage.totals.totalTokens, myUsage.limits.dailyTokenLimit)})`,
      });
    }
    if (myUsage.limits.dailyCostLimitUsd !== null) {
      items.push({
        label: 'Limite de custo/dia',
        value: `${formatUsd(myUsage.totals.costUsd)} / ${formatUsd(myUsage.limits.dailyCostLimitUsd)} (${formatPercent(myUsage.totals.costUsd, myUsage.limits.dailyCostLimitUsd)})`,
      });
    }
    return items;
  }, [myUsage]);

  const metricItems = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Custo estimado', value: formatUsd(data.totals.costUsd) },
      { label: 'Tokens totais', value: formatInteger(data.totals.totalTokens) },
      { label: 'Chamadas', value: formatInteger(data.totals.callCount) },
      { label: 'Latência média', value: formatDuration(data.totals.averageDurationMs) },
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

      {providerConfig && (
        <section data-testid="ai-provider-config" className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Provider de IA ativo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurado via variáveis de ambiente do processo da API; esta tela só exibe o valor atual, não permite
            trocar em runtime.
          </p>
          <p className="mt-3 text-sm">
            Provider ativo: <Badge>{PROVIDER_LABEL[providerConfig.provider]}</Badge>
            {providerConfig.model && (
              <>
                {' '}
                · Modelo: <span className="font-mono text-xs">{providerConfig.model}</span>
              </>
            )}
          </p>
          {providerConfig.provider !== 'mock' && !providerConfig.apiKeyConfigured && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Chave de API deste provider não está configurada no processo da API — execuções reais falharão até que
              seja definida.
            </p>
          )}
        </section>
      )}

      <section data-testid="my-ai-usage" className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Meu uso (últimas 24h)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Uso das suas próprias execuções de IA disparadas nas últimas 24h, independente do limite de organização.
        </p>
        {isMyUsageLoading && <p className="mt-3 text-sm text-muted-foreground">Carregando...</p>}
        {myUsage && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {myUsageItems.map((item) => (
              <div key={item.label} className="rounded-md border border-border p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-semibold tracking-tight">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando uso de IA...</p>}
      {isError && <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar o uso de IA.</p>}

      {data && (
        <>
          <div data-testid="org-ai-usage-totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
              </div>
            ))}
          </div>

          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Série histórica (últimos 14 dias)</h2>
              <Badge>{data.timeseries.length} dias</Badge>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Dia</th>
                    <th className="px-3 py-2 text-right font-medium">Chamadas</th>
                    <th className="px-3 py-2 text-right font-medium">Tokens</th>
                    <th className="px-3 py-2 text-right font-medium">Latência média</th>
                    <th className="px-3 py-2 text-right font-medium">Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.timeseries.map((point) => (
                    <tr key={point.date}>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                        {point.date}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">{formatInteger(point.callCount)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs">{formatInteger(point.totalTokens)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        {formatDuration(point.averageDurationMs)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">{formatUsd(point.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

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
                        <th className="px-3 py-2 text-right font-medium">Latência</th>
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
                          <td className="px-3 py-3 text-right font-mono text-xs">
                            {formatDuration(item.averageDurationMs)}
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
                        <th className="px-3 py-2 text-right font-medium">Latência</th>
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
                          <td className="px-3 py-3 text-right font-mono text-xs">
                            {formatDuration(item.durationMs)}
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
