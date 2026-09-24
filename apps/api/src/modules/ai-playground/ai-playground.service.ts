import { Injectable } from '@nestjs/common';
import type {
  AIPlaygroundDatasetItem,
  AIPlaygroundEvaluationCaseResult,
  AIPlaygroundEvaluationModelResult,
  AIPlaygroundEvaluationRequest,
  AIPlaygroundEvaluationResponse,
  AIPlaygroundModel,
  AIPlaygroundModelId,
} from '@forge/types';

interface ModelProfile extends AIPlaygroundModel {
  baseLatencyMs: number;
  latencyPerTokenMs: number;
  completionFactor: number;
  structuredReliability: number;
  reasoningWeight: number;
}

const MODEL_PROFILES: readonly ModelProfile[] = [
  {
    id: 'forge-mock-fast',
    provider: 'mock',
    name: 'Forge Mock Fast',
    description: 'Baixa latência para triagem e prompts curtos.',
    inputCostPerMillionTokensUsd: 0.2,
    outputCostPerMillionTokensUsd: 0.8,
    baseLatencyMs: 320,
    latencyPerTokenMs: 1.6,
    completionFactor: 0.32,
    structuredReliability: 0.82,
    reasoningWeight: 0.82,
  },
  {
    id: 'forge-mock-balanced',
    provider: 'mock',
    name: 'Forge Mock Balanced',
    description: 'Equilíbrio entre qualidade, custo e aderência a JSON.',
    inputCostPerMillionTokensUsd: 0.8,
    outputCostPerMillionTokensUsd: 3,
    baseLatencyMs: 620,
    latencyPerTokenMs: 2.3,
    completionFactor: 0.44,
    structuredReliability: 0.96,
    reasoningWeight: 0.96,
  },
  {
    id: 'forge-mock-reviewer',
    provider: 'mock',
    name: 'Forge Mock Reviewer',
    description: 'Mais lento e caro, favorece cobertura de critérios e revisão.',
    inputCostPerMillionTokensUsd: 2.4,
    outputCostPerMillionTokensUsd: 8,
    baseLatencyMs: 980,
    latencyPerTokenMs: 3.2,
    completionFactor: 0.54,
    structuredReliability: 0.99,
    reasoningWeight: 1,
  },
];

export const AI_PLAYGROUND_DEFAULT_DATASET: readonly AIPlaygroundDatasetItem[] = [
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

@Injectable()
export class AIPlaygroundService {
  getModels(): AIPlaygroundModel[] {
    return MODEL_PROFILES.map(({ baseLatencyMs: _base, latencyPerTokenMs: _latency, completionFactor: _factor, structuredReliability: _reliability, reasoningWeight: _weight, ...model }) => model);
  }

  getDefaultDataset(): AIPlaygroundDatasetItem[] {
    return AI_PLAYGROUND_DEFAULT_DATASET.map((item) => ({ ...item, expectedKeywords: [...item.expectedKeywords] }));
  }

  evaluate(input: AIPlaygroundEvaluationRequest): AIPlaygroundEvaluationResponse {
    const results = input.models.map((modelId) => {
      const profile = findModelProfile(modelId);
      return evaluateModel(profile, input);
    });
    const [winner] = [...results].sort(
      (a, b) => b.averageScore - a.averageScore || a.totalCostUsd - b.totalCostUsd || a.averageLatencyMs - b.averageLatencyMs,
    );

    return {
      results,
      winner: winner?.model.id ?? input.models[0],
    };
  }
}

function findModelProfile(modelId: AIPlaygroundModelId): ModelProfile {
  const model = MODEL_PROFILES.find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Modelo desconhecido: ${modelId}`);
  }
  return model;
}

function evaluateModel(profile: ModelProfile, input: AIPlaygroundEvaluationRequest): AIPlaygroundEvaluationModelResult {
  const cases = input.dataset.map((item) => evaluateCase(profile, input, item));
  const totalTokens = cases.reduce((total, item) => total + item.totalTokens, 0);
  const totalCostUsd = roundUsd(cases.reduce((total, item) => total + item.costUsd, 0));
  const averageLatencyMs = Math.round(cases.reduce((total, item) => total + item.latencyMs, 0) / cases.length);
  const averageScore = roundScore(cases.reduce((total, item) => total + item.score, 0) / cases.length);
  const structuredValidityRate = roundScore(
    cases.filter((item) => item.structuredOutputValid).length / Math.max(1, cases.length),
  );

  return {
    model: {
      id: profile.id,
      provider: profile.provider,
      name: profile.name,
      description: profile.description,
      inputCostPerMillionTokensUsd: profile.inputCostPerMillionTokensUsd,
      outputCostPerMillionTokensUsd: profile.outputCostPerMillionTokensUsd,
    },
    cases,
    averageScore,
    totalTokens,
    totalCostUsd,
    averageLatencyMs,
    structuredValidityRate,
  };
}

function evaluateCase(
  profile: ModelProfile,
  input: AIPlaygroundEvaluationRequest,
  item: AIPlaygroundDatasetItem,
): AIPlaygroundEvaluationCaseResult {
  const promptText = `${input.prompt}\n\nCaso: ${item.title}\n${item.input}`;
  const promptTokens = estimateTokens(promptText);
  const completionTokens = Math.max(24, Math.ceil(promptTokens * profile.completionFactor));
  const totalTokens = promptTokens + completionTokens;
  const latencyMs = Math.round(profile.baseLatencyMs + totalTokens * profile.latencyPerTokenMs);
  const costUsd = roundUsd(
    (promptTokens / 1_000_000) * profile.inputCostPerMillionTokensUsd +
      (completionTokens / 1_000_000) * profile.outputCostPerMillionTokensUsd,
  );
  const matchedKeywords = matchKeywords(item);
  const missingKeywords = item.expectedKeywords.filter((keyword) => !matchedKeywords.includes(keyword));
  const keywordCoverage =
    item.expectedKeywords.length === 0 ? 1 : matchedKeywords.length / Math.max(1, item.expectedKeywords.length);
  const structuredOutputValid = !input.requireStructuredOutput || profile.structuredReliability >= 0.9 || promptTokens < 180;
  const score = roundScore(
    keywordCoverage * 0.6 + (structuredOutputValid ? 0.25 : 0) + profile.reasoningWeight * 0.15,
  );
  const output = buildOutput(profile, item, matchedKeywords, missingKeywords, structuredOutputValid);

  return {
    datasetItemId: item.id,
    output,
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs,
    costUsd,
    structuredOutputValid,
    score,
    matchedKeywords,
    missingKeywords,
  };
}

function buildOutput(
  profile: ModelProfile,
  item: AIPlaygroundDatasetItem,
  matchedKeywords: readonly string[],
  missingKeywords: readonly string[],
  structuredOutputValid: boolean,
): string {
  const decision = missingKeywords.length === 0 ? 'ready_for_review' : 'needs_more_context';
  const payload = {
    model: profile.id,
    case: item.id,
    decision,
    summary: `${item.title}: ${matchedKeywords.length} critério(s) cobertos.`,
    evidence: matchedKeywords,
    gaps: missingKeywords,
  };

  if (structuredOutputValid) return JSON.stringify(payload, null, 2);
  return `${payload.summary}\nDecisão: ${decision}\nGaps: ${missingKeywords.join(', ') || 'nenhum'}`;
}

function matchKeywords(item: AIPlaygroundDatasetItem): string[] {
  const haystack = normalize(`${item.title}\n${item.input}`);
  return item.expectedKeywords.filter((keyword) => haystack.includes(normalize(keyword)));
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.trim().split(/\s+/).filter(Boolean).length * 1.25));
}

function normalize(content: string): string {
  return content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
