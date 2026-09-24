import type { MemberRole } from '@forge/types';

/**
 * Espelha o conjunto de papéis com `agent_run:approve`
 * (`packages/domain/src/permissions.ts`, `ROLE_PERMISSIONS`) só para
 * decidir se os botões "Aprovar execução"/"Rejeitar execução" aparecem —
 * mesmo raciocínio de `agent-run-cancelable.ts`: `apps/web` não depende de
 * `@forge/domain`, então a regra é duplicada aqui deliberadamente, não
 * importada. A fonte de verdade continua sendo o backend
 * (`@RequirePermission('agent_run:approve')` em
 * `AgentRunsController.approve`/`.reject`, que responde 403 de verdade); se
 * este espelho ficar desatualizado, o pior caso é mostrar (ou esconder) os
 * botões incorretamente por um instante — nunca uma decisão sem o guard
 * real por trás.
 */
const ROLES_THAT_CAN_APPROVE_AGENT_RUNS = new Set<MemberRole>(['admin', 'platform_engineer', 'tech_lead']);

export function canApproveAgentRuns(role: MemberRole): boolean {
  return ROLES_THAT_CAN_APPROVE_AGENT_RUNS.has(role);
}
