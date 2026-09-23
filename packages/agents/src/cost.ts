import type { AiUsage } from '@forge/ai';

/**
 * Estimativa determinística de custo em USD a partir do uso de tokens
 * (spec do briefing da Fase 7 — "pode ser estimado de forma
 * determinística, não precisa ser realista"). Preços fixos e documentados
 * aqui (ordem de grandeza de um modelo de porte médio: US$3/milhão de
 * tokens de prompt, US$15/milhão de tokens de completion) — nunca variam
 * por chamada, então o mesmo `AiUsage` sempre produz o mesmo custo.
 */
const PROMPT_TOKEN_COST_USD = 0.000_003;
const COMPLETION_TOKEN_COST_USD = 0.000_015;

export function estimateCostUsd(usage: Pick<AiUsage, 'promptTokens' | 'completionTokens'>): number {
  const cost = usage.promptTokens * PROMPT_TOKEN_COST_USD + usage.completionTokens * COMPLETION_TOKEN_COST_USD;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
