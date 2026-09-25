/**
 * Conta adições/remoções de um unified diff real (o mesmo formato que
 * `AgentRunWorkspaceService.applyApprovedWrite` já aplicou de verdade com
 * `applyPatch`, jsdiff) — usado para preencher `diffs.additions`/
 * `diffs.deletions` (Fase 10 continuação) sem depender de um número
 * hardcoded como o `mock-provider.ts` fazia (`additions: 1, deletions: 0`,
 * só para o resultado SIMULADO). Conta linhas de conteúdo que começam com
 * `+`/`-`, ignorando as linhas de cabeçalho `+++`/`---` do próprio unified
 * diff.
 */
export function countPatchStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}
