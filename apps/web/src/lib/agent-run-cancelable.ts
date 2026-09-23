import type { AgentRunStatus } from '@forge/types';

/**
 * Espelha `isAgentRunStatusCancellable`/`AGENT_RUN_STATUS_TRANSITIONS` de
 * `@forge/domain` (`packages/domain/src/agent-run-status.ts`) só para
 * decidir se o botão "Cancelar execução" aparece — `apps/web` não depende
 * de `@forge/domain` (só de `@forge/types`, ver `package.json`), então a
 * regra é duplicada aqui deliberadamente, não importada. A fonte de
 * verdade continua sendo o backend: se este espelho ficar desatualizado, o
 * pior caso é mostrar (ou esconder) o botão incorretamente por um
 * instante — `POST /agent-runs/:id/cancel` sempre reavalia a transição de
 * verdade e responde 409 se não for permitida (ver `AgentRunsService.cancel`).
 */
const TERMINAL_AGENT_RUN_STATUSES = new Set<AgentRunStatus>(['completed', 'failed', 'cancelled']);

export function isAgentRunCancelable(status: AgentRunStatus): boolean {
  return !TERMINAL_AGENT_RUN_STATUSES.has(status);
}
