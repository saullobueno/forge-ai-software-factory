import type { AgentToolName, MemberRole, Permission, PolicyDecisionKind } from '@forge/types';
import { hasPermission } from './permissions.ts';
import { decideToolPolicy } from './tool-policy.ts';

/**
 * Permissão mínima exigida para invocar cada ferramenta tipada (spec §8).
 * Ferramentas somente leitura exigem apenas `project:read`; ferramentas que
 * escrevem código, executam comandos, criam branch/commit/PR ou rodam
 * testes exigem `agent_run:trigger` — a mesma permissão que autoriza um
 * ator a iniciar uma execução de IA com efeitos colaterais (spec §9).
 * `agent_run:approve` é decidido em outro ponto do fluxo (aprovação
 * humana de uma `require_approval`), não aqui.
 */
const TOOL_PERMISSION: Readonly<Record<AgentToolName, Permission>> = {
  list_files: 'project:read',
  read_file: 'project:read',
  search_code: 'project:read',
  inspect_git: 'project:read',
  get_issue: 'project:read',
  get_project_rules: 'project:read',
  inspect_diff: 'project:read',
  run_tests: 'agent_run:trigger',
  create_branch: 'agent_run:trigger',
  write_file: 'agent_run:trigger',
  apply_patch: 'agent_run:trigger',
  run_command: 'agent_run:trigger',
  create_commit: 'agent_run:trigger',
  create_pull_request: 'agent_run:trigger',
};

export interface AuthorizeToolCallInput {
  actor: { role: MemberRole; organizationId: string };
  /** Organização dona do recurso (projeto/workspace/tarefa) alvo da tool call. */
  resourceOrganizationId: string;
  toolName: AgentToolName;
  args?: Record<string, unknown>;
}

export interface AuthorizeToolCallDecision {
  decision: PolicyDecisionKind;
  reason: string;
}

/**
 * Decisão final de autorização para uma tool call (Fase 2 — Auth/RBAC).
 * Compõe três camadas, nessa ordem, sem duplicar a lógica de nenhuma:
 *
 * 1. Isolamento de tenant — se o recurso não pertence à organização do
 *    ator, nega incondicionalmente. Isso vale mesmo que `decideToolPolicy`
 *    aprovaria a ferramenta em outro contexto: cross-tenant nunca é
 *    permitido, ponto.
 * 2. RBAC — o `role` do ator precisa ter a permissão mínima exigida pelo
 *    tipo de ferramenta (`TOOL_PERMISSION`). Papéis sem a permissão são
 *    negados antes de qualquer avaliação de política.
 * 3. Política por tipo de ferramenta — delega para `decideToolPolicy`
 *    (heurísticas de comando destrutivo, allow/require_approval/deny por
 *    ferramenta). Esta função nunca reimplementa essas regras.
 */
export function authorizeToolCall(input: AuthorizeToolCallInput): AuthorizeToolCallDecision {
  const { actor, resourceOrganizationId, toolName, args } = input;

  if (actor.organizationId !== resourceOrganizationId) {
    return {
      decision: 'deny',
      reason: 'Recurso pertence a outra organização — isolamento de tenant.',
    };
  }

  const requiredPermission = TOOL_PERMISSION[toolName];
  if (!hasPermission(actor.role, requiredPermission)) {
    return {
      decision: 'deny',
      reason: `Papel "${actor.role}" não tem a permissão "${requiredPermission}" exigida por "${toolName}".`,
    };
  }

  return decideToolPolicy(args === undefined ? { toolName } : { toolName, args });
}
