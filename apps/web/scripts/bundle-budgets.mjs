// Budgets por rota (bytes de JS não comprimido no "first load", a mesma
// métrica que `.next/diagnostics/route-bundle-stats.json` grava a cada
// `next build` — ver check-bundle-budgets.mjs para como esse arquivo é
// lido). Números calibrados a partir de uma rodada real de
// `pnpm --filter @forge/web build` em 2026-09-29 (ver PROGRESS.md, seção
// "Continuação da Fase 15 — budgets de bundle em CI"): observado + ~12% de
// margem, arredondado para o múltiplo de 5 KB acima, para tolerar
// flutuação normal entre builds (versões de dependência, ordem de chunking)
// sem deixar de pegar uma regressão real.
export const ROUTE_BUDGETS_BYTES = {
  '/projects/[id]/tasks/[taskId]/runs/[runId]': 665 * 1024,
  '/login': 655 * 1024,
  '/projects/[id]/code': 585 * 1024,
  '/projects/[id]': 580 * 1024,
  '/projects/[id]/tasks/[taskId]': 570 * 1024,
  '/ai-playground': 570 * 1024,
  '/ai-usage': 565 * 1024,
  '/audit-logs': 560 * 1024,
  '/approvals': 560 * 1024,
  '/projects': 560 * 1024,
  '/': 530 * 1024,
  '/_not-found': 530 * 1024,
};

// Para uma rota nova ainda sem entrada em ROUTE_BUDGETS_BYTES: teto igual
// ao maior budget já calibrado acima (665 KB), para continuar pegando uma
// rota nova genuinamente pesada sem exigir que toda rota nova comece com
// um budget dedicado.
export const DEFAULT_BUDGET_BYTES = 700 * 1024;

export function budgetForRoute(route) {
  return ROUTE_BUDGETS_BYTES[route] ?? DEFAULT_BUDGET_BYTES;
}

export function evaluateBundleBudgets(routeStats) {
  return routeStats.map((entry) => {
    const budgetBytes = budgetForRoute(entry.route);
    const actualBytes = entry.firstLoadUncompressedJsBytes;
    return {
      route: entry.route,
      actualBytes,
      budgetBytes,
      withinBudget: actualBytes <= budgetBytes,
      exceededByBytes: Math.max(0, actualBytes - budgetBytes),
    };
  });
}
