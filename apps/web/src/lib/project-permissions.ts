import type { MemberRole } from '@forge/types';

/**
 * Espelham `project:write` e `task:manage` (`packages/domain/src/permissions.ts`,
 * `ROLE_PERMISSIONS`) só para decidir se os botões "Novo projeto"/"Nova tarefa"
 * aparecem — mesmo raciocínio de `knowledge-reindex-permission.ts`: `apps/web`
 * não depende de `@forge/domain`, e a autorização real é sempre o guard do
 * backend (403), nunca este espelho.
 */
const ROLES_THAT_CAN_CREATE_PROJECTS = new Set<MemberRole>(['admin', 'tech_lead']);
const ROLES_THAT_CAN_CREATE_TASKS = new Set<MemberRole>(['admin', 'tech_lead', 'developer', 'product_manager']);

export function canCreateProject(role: MemberRole): boolean {
  return ROLES_THAT_CAN_CREATE_PROJECTS.has(role);
}

export function canCreateTask(role: MemberRole): boolean {
  return ROLES_THAT_CAN_CREATE_TASKS.has(role);
}

/** Editar e excluir usam as mesmas permissões de criar (`project:write` / `task:manage`). */
export const canManageProject = canCreateProject;
export const canManageTask = canCreateTask;

/** Espelham `member:manage` (só admin) e `policy:manage` (admin e platform_engineer). */
export function canManageMembers(role: MemberRole): boolean {
  return role === 'admin';
}

export function canManagePolicies(role: MemberRole): boolean {
  return role === 'admin' || role === 'platform_engineer';
}
