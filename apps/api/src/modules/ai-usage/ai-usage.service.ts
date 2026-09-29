import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { describeAiProviderConfig, type AiProviderConfigSummary } from '@forge/ai';
import { readAiUsageLimits, readAiUserUsageLimits, type AiUsageLimits } from '../../infrastructure/config/env.js';
import { AiUsageRepository, type AiUsageRow } from './ai-usage.repository.js';

export interface AiUsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  callCount: number;
  averageDurationMs: number | null;
  durationSampleCount: number;
}

export interface AiUsageProviderSummary extends AiUsageTotals {
  provider: string;
  model: string;
}

export interface AiUsageRecentItem {
  id: string;
  agentRunId: string | null;
  agentStepId: string | null;
  aiMessageId: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number | null;
  createdAt: Date;
}

/**
 * Um ponto diário da série histórica de uso de IA (Fase 13, pendência
 * "séries históricas de custo/latência"). `date` é a chave `YYYY-MM-DD`
 * em UTC (mesmo fuso que `ai_usages.createdAt`, coluna `timestamp` sem
 * timezone própria gravada pelo banco em UTC) — dias sem nenhum uso
 * aparecem com zeros/`null`, nunca omitidos, para que a UI possa desenhar
 * uma janela contínua de `AI_USAGE_TIMESERIES_DAYS` dias.
 */
export interface AiUsageDailyPoint {
  date: string;
  totalTokens: number;
  costUsd: number;
  callCount: number;
  averageDurationMs: number | null;
}

export interface AiUsageSummary {
  totals: AiUsageTotals;
  byProvider: AiUsageProviderSummary[];
  recent: AiUsageRecentItem[];
  sampleSize: number;
  timeseries: AiUsageDailyPoint[];
}

/**
 * Resumo do uso do PRÓPRIO usuário autenticado nas últimas 24h (Fase 13
 * continuação #7), consumido por `GET /ai-usage/me` — deliberadamente sem
 * `byProvider`/`recent` (que exigiriam mais dados/decisões de UI do que o
 * escopo mínimo desta continuação: só o essencial para alguém enxergar o
 * quão perto está do próprio limite antes de bater nele).
 */
export interface AiUserUsageSummary {
  totals: AiUsageTotals;
  limits: AiUsageLimits;
  windowStartedAt: Date;
}

const EMPTY_TOTALS: AiUsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  callCount: 0,
  averageDurationMs: null,
  durationSampleCount: 0,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_LIMIT_WINDOW_MS = ONE_DAY_MS;

/**
 * Janela da série histórica diária: 14 dias (duas semanas) — o suficiente
 * para enxergar uma tendência real de custo/latência semana a semana
 * (comparar esta semana com a anterior) sem escanear um histórico
 * grande demais para um `GET` síncrono de dashboard. 30 dias foi
 * considerado e descartado por ora: multiplicaria por ~2 o volume de
 * `ai_usages` lido a cada carregamento de `/ai-usage` sem mudar a decisão
 * operacional que a tela resolve (ver tendência recente); pode ser
 * revisitado se um usuário real pedir mais alcance.
 */
const AI_USAGE_TIMESERIES_DAYS = 14;

type AiUsageAccumulator = AiUsageTotals & { durationTotalMs: number };

function createAccumulator(): AiUsageAccumulator {
  return { ...EMPTY_TOTALS, durationTotalMs: 0 };
}

function addUsage(target: AiUsageAccumulator, usage: AiUsageRow & { agentStep?: { durationMs: number | null } | null }): void {
  target.promptTokens += usage.promptTokens;
  target.completionTokens += usage.completionTokens;
  target.totalTokens += usage.totalTokens;
  target.costUsd += Number(usage.costUsd);
  target.callCount += 1;

  const durationMs = usage.agentStep?.durationMs ?? null;
  if (typeof durationMs === 'number') {
    target.durationTotalMs += durationMs;
    target.durationSampleCount += 1;
    target.averageDurationMs = Math.round(target.durationTotalMs / target.durationSampleCount);
  }
}

function finalizeTotals(total: AiUsageAccumulator): AiUsageTotals {
  const { durationTotalMs: _durationTotalMs, ...result } = total;
  return result;
}

function dateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AiUsageService {
  constructor(private readonly aiUsageRepository: AiUsageRepository) {}

  async summarizeByOrganization(organizationId: string): Promise<AiUsageSummary> {
    const [usages, timeseries] = await Promise.all([
      this.aiUsageRepository.listRecentByOrganization(organizationId),
      this.buildTimeseries(organizationId),
    ]);
    const totals = createAccumulator();
    const byProvider = new Map<string, AiUsageProviderSummary & { durationTotalMs: number }>();

    for (const usage of usages) {
      addUsage(totals, usage);

      const groupKey = `${usage.provider}\u0000${usage.model}`;
      const group = byProvider.get(groupKey) ?? {
        provider: usage.provider,
        model: usage.model,
        ...createAccumulator(),
      };
      addUsage(group, usage);
      byProvider.set(groupKey, group);
    }

    return {
      totals: finalizeTotals(totals),
      byProvider: [...byProvider.values()]
        .map(finalizeProviderSummary)
        .sort((left, right) => right.costUsd - left.costUsd),
      recent: usages.slice(0, 50).map((usage) => ({
        id: usage.id,
        agentRunId: usage.agentRunId,
        agentStepId: usage.agentStepId,
        aiMessageId: usage.aiMessageId,
        provider: usage.provider,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        costUsd: Number(usage.costUsd),
        durationMs: usage.agentStep?.durationMs ?? null,
        createdAt: usage.createdAt,
      })),
      sampleSize: usages.length,
      timeseries,
    };
  }

  /**
   * Série histórica diária (Fase 13, "séries históricas pendentes"):
   * agrupa `ai_usages` por dia (UTC) dos últimos `AI_USAGE_TIMESERIES_DAYS`
   * dias, escopado por organização (mesma regra multi-tenant de todo
   * endpoint de agregação já existente). Agregação em memória, mesmo
   * estilo já usado por `summarizeByOrganization`/`assertWithin*Limits`
   * (sem `GROUP BY` no banco) — coerente com o volume real desta demo e
   * evita introduzir um segundo estilo de query só para este campo.
   */
  private async buildTimeseries(organizationId: string): Promise<AiUsageDailyPoint[]> {
    const since = new Date(Date.now() - (AI_USAGE_TIMESERIES_DAYS - 1) * ONE_DAY_MS);
    since.setUTCHours(0, 0, 0, 0);

    const usages = await this.aiUsageRepository.listByOrganizationSinceWithDuration(organizationId, since);

    const byDay = new Map<string, AiUsageAccumulator>();
    for (const usage of usages) {
      const key = dateKeyUTC(usage.createdAt);
      const accumulator = byDay.get(key) ?? createAccumulator();
      addUsage(accumulator, usage);
      byDay.set(key, accumulator);
    }

    const points: AiUsageDailyPoint[] = [];
    for (let offset = AI_USAGE_TIMESERIES_DAYS - 1; offset >= 0; offset -= 1) {
      const key = dateKeyUTC(new Date(Date.now() - offset * ONE_DAY_MS));
      const accumulator = byDay.get(key);
      const totals = accumulator ? finalizeTotals(accumulator) : EMPTY_TOTALS;
      points.push({
        date: key,
        totalTokens: totals.totalTokens,
        costUsd: totals.costUsd,
        callCount: totals.callCount,
        averageDurationMs: totals.averageDurationMs,
      });
    }
    return points;
  }

  async assertWithinOrganizationLimits(organizationId: string): Promise<void> {
    const limits = readAiUsageLimits();
    if (!limits.dailyTokenLimit && !limits.dailyCostLimitUsd) return;

    const windowStartedAt = new Date(Date.now() - DAILY_LIMIT_WINDOW_MS);
    const usages = await this.aiUsageRepository.listByOrganizationSince(organizationId, windowStartedAt);
    const totals = createAccumulator();
    for (const usage of usages) {
      addUsage(totals, usage);
    }

    const exceeded = this.getExceededLimits(totals, limits);
    if (exceeded.length === 0) return;

    throw new HttpException({
      message: 'Limite diário de uso de IA atingido para esta organização.',
      scope: 'organization',
      limits,
      totals: finalizeTotals(totals),
      exceeded,
      windowStartedAt,
    }, HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Camada ADICIONAL sobre `assertWithinOrganizationLimits` (Fase 13
   * continuação #7): avalia o uso das últimas 24h do USUÁRIO que está
   * disparando a execução (`agentRuns.requestedByUserId`, não
   * `organizationId`) contra `AI_USER_DAILY_TOKEN_LIMIT`/
   * `AI_USER_DAILY_COST_LIMIT_USD`. Os dois limites (organização e
   * usuário) podem estar ativos simultaneamente; qualquer um dos dois já
   * sendo atingido basta para bloquear com 429 — esta chamada é
   * independente da de organização (`AgentRunsService.triggerForTask`
   * chama as duas), nunca substitui aquela.
   *
   * O corpo da exceção usa `scope: 'user'` (em vez de `'organization'`)
   * para que quem recebe o 429 (UI ou audit log de erro, se algum dia
   * existir) saiba exatamente qual dos dois limites foi o motivo — nunca
   * uma mensagem genérica que misturasse os dois.
   */
  async assertWithinUserLimits(organizationId: string, userId: string): Promise<void> {
    const limits = readAiUserUsageLimits();
    if (!limits.dailyTokenLimit && !limits.dailyCostLimitUsd) return;

    const windowStartedAt = new Date(Date.now() - DAILY_LIMIT_WINDOW_MS);
    const usages = await this.aiUsageRepository.listByUserSince(organizationId, userId, windowStartedAt);
    const totals = createAccumulator();
    for (const usage of usages) {
      addUsage(totals, usage);
    }

    const exceeded = this.getExceededLimits(totals, limits);
    if (exceeded.length === 0) return;

    throw new HttpException({
      message: 'Limite diário de uso de IA atingido para este usuário.',
      scope: 'user',
      limits,
      totals: finalizeTotals(totals),
      exceeded,
      windowStartedAt,
    }, HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Uso do PRÓPRIO usuário autenticado nas últimas 24h (Fase 13
   * continuação #7), consumido por `GET /ai-usage/me` — deliberadamente
   * sem exigir `audit_log:read` (ao contrário de `summarizeByOrganization`):
   * qualquer usuário autenticado pode ver o próprio uso/proximidade do
   * próprio limite, mesmo quem não tem permissão para ver o agregado da
   * organização inteira (ex. `developer`). Reaproveita a mesma janela de
   * 24h e o mesmo `listByUserSince` já usado por `assertWithinUserLimits`
   * — nenhuma consulta nova.
   */
  async summarizeForUser(organizationId: string, userId: string): Promise<AiUserUsageSummary> {
    const limits = readAiUserUsageLimits();
    const windowStartedAt = new Date(Date.now() - DAILY_LIMIT_WINDOW_MS);
    const usages = await this.aiUsageRepository.listByUserSince(organizationId, userId, windowStartedAt);
    const totals = createAccumulator();
    for (const usage of usages) {
      addUsage(totals, usage);
    }

    return { totals: finalizeTotals(totals), limits, windowStartedAt };
  }

  /**
   * Provider/modelo REALMENTE configurado no processo da API via env (Fase
   * 13, "UI operacional para selecionar provider/modelo") — sempre
   * read-only, nunca troca provider em runtime; `describeAiProviderConfig`
   * (`@forge/ai`) reaproveita a mesma resolução de provider/modelo/fallback
   * já usada por `createAiProvider()` (`AgentRunsModule`), então esta rota
   * nunca pode divergir do provider de verdade usado para disparar
   * execuções de agente.
   */
  getProviderConfig(): AiProviderConfigSummary {
    return describeAiProviderConfig();
  }

  private getExceededLimits(totals: AiUsageTotals, limits: AiUsageLimits): string[] {
    const exceeded: string[] = [];
    if (limits.dailyTokenLimit !== null && totals.totalTokens >= limits.dailyTokenLimit) {
      exceeded.push('tokens');
    }
    if (limits.dailyCostLimitUsd !== null && totals.costUsd >= limits.dailyCostLimitUsd) {
      exceeded.push('costUsd');
    }
    return exceeded;
  }
}

function finalizeProviderSummary(summary: AiUsageProviderSummary & { durationTotalMs: number }): AiUsageProviderSummary {
  const { durationTotalMs: _durationTotalMs, ...result } = summary;
  return result;
}
