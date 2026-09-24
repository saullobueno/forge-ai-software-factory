import type { MemberRole } from '@forge/types';

/**
 * Espelha `environment:approve_deployment` (`packages/domain/src/permissions.ts`,
 * `ROLE_PERMISSIONS`) só para decidir se os botões "Aprovar deploy"/"Rejeitar
 * deploy" aparecem — mesmo raciocínio de `agent-run-approval-permission.ts`:
 * `apps/web` não depende de `@forge/domain`, então a regra é duplicada aqui
 * deliberadamente, não importada. A fonte de verdade continua sendo o
 * backend (`@RequirePermission('environment:approve_deployment')` em
 * `EnvironmentsController.approveDeployment`/`.rejectDeployment`, que
 * responde 403 de verdade); se este espelho ficar desatualizado, o pior caso
 * é mostrar (ou esconder) os botões incorretamente por um instante — nunca
 * uma decisão sem o guard real por trás.
 *
 * Deliberadamente restrito a `admin` apenas — diferente de
 * `canRequestDeployment` (`platform_engineer`/`admin`, em
 * `project-detail-view.tsx`): quem só pode solicitar deploy não pode
 * decidir o próprio pedido, ver o comentário em `permissions.ts`.
 */
const ROLES_THAT_CAN_APPROVE_DEPLOYMENTS = new Set<MemberRole>(['admin']);

export function canApproveDeployments(role: MemberRole): boolean {
  return ROLES_THAT_CAN_APPROVE_DEPLOYMENTS.has(role);
}
