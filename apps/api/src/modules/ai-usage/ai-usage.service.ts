import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { readAiUsageLimits, type AiUsageLimits } from '../../infrastructure/config/env.js';
import { AiUsageRepository, type AiUsageRow } from './ai-usage.repository.js';

export interface AiUsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  callCount: number;
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
  createdAt: Date;
}

export interface AiUsageSummary {
  totals: AiUsageTotals;
  byProvider: AiUsageProviderSummary[];
  recent: AiUsageRecentItem[];
  sampleSize: number;
}

const EMPTY_TOTALS: AiUsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  callCount: 0,
};

const DAILY_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function addUsage(target: AiUsageTotals, usage: AiUsageRow): void {
  target.promptTokens += usage.promptTokens;
  target.completionTokens += usage.completionTokens;
  target.totalTokens += usage.totalTokens;
  target.costUsd += Number(usage.costUsd);
  target.callCount += 1;
}

@Injectable()
export class AiUsageService {
  constructor(private readonly aiUsageRepository: AiUsageRepository) {}

  async summarizeByOrganization(organizationId: string): Promise<AiUsageSummary> {
    const usages = await this.aiUsageRepository.listRecentByOrganization(organizationId);
    const totals = { ...EMPTY_TOTALS };
    const byProvider = new Map<string, AiUsageProviderSummary>();

    for (const usage of usages) {
      addUsage(totals, usage);

      const groupKey = `${usage.provider}\u0000${usage.model}`;
      const group = byProvider.get(groupKey) ?? {
        provider: usage.provider,
        model: usage.model,
        ...EMPTY_TOTALS,
      };
      addUsage(group, usage);
      byProvider.set(groupKey, group);
    }

    return {
      totals,
      byProvider: [...byProvider.values()].sort((left, right) => right.costUsd - left.costUsd),
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
        createdAt: usage.createdAt,
      })),
      sampleSize: usages.length,
    };
  }

  async assertWithinOrganizationLimits(organizationId: string): Promise<void> {
    const limits = readAiUsageLimits();
    if (!limits.dailyTokenLimit && !limits.dailyCostLimitUsd) return;

    const windowStartedAt = new Date(Date.now() - DAILY_LIMIT_WINDOW_MS);
    const usages = await this.aiUsageRepository.listByOrganizationSince(organizationId, windowStartedAt);
    const totals = { ...EMPTY_TOTALS };
    for (const usage of usages) {
      addUsage(totals, usage);
    }

    const exceeded = this.getExceededLimits(totals, limits);
    if (exceeded.length === 0) return;

    throw new HttpException({
      message: 'Limite diário de uso de IA atingido para esta organização.',
      limits,
      totals,
      exceeded,
      windowStartedAt,
    }, HttpStatus.TOO_MANY_REQUESTS);
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
