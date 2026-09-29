import type { MemberRole } from '@forge/types';

/**
 * Espelha `project:write` (`packages/domain/src/permissions.ts`,
 * `ROLE_PERMISSIONS`) só para decidir se o botão "Reindexar" aparece —
 * mesmo raciocínio de `agent-run-approval-permission.ts`/
 * `deployment-approval-permission.ts`: `apps/web` não depende de
 * `@forge/domain`, então a regra é duplicada aqui deliberadamente, não
 * importada. A fonte de verdade continua sendo o backend
 * (`@RequirePermission('project:write')` em `KnowledgeController.reindex`,
 * que responde 403 de verdade); se este espelho ficar desatualizado, o pior
 * caso é mostrar (ou esconder) o botão incorretamente por um instante —
 * nunca uma decisão sem o guard real por trás.
 */
const ROLES_THAT_CAN_REINDEX_KNOWLEDGE = new Set<MemberRole>(['admin', 'tech_lead']);

export function canReindexKnowledge(role: MemberRole): boolean {
  return ROLES_THAT_CAN_REINDEX_KNOWLEDGE.has(role);
}
