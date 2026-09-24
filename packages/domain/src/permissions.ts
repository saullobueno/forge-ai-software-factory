import type { MemberRole, Permission } from '@forge/types';
import { permissionSchema } from '@forge/types';

/**
 * Matriz estática role -> Permission[] (Fase 2 — Auth/RBAC). Mapeada a
 * partir das personas da spec §2:
 * - `admin`: "controla modelos, repositórios, permissões e auditoria" —
 *   superusuário, recebe todas as permissões.
 * - `platform_engineer`: "gerencia ambientes, runners, secrets e
 *   políticas" — sem gestão de membros.
 * - `tech_lead`: "decompõe iniciativas, revisa arquitetura e aprovações" —
 *   escreve projeto, gerencia tarefas, aprova execuções de IA.
 * - `developer`: "delega tarefas de implementação com escopo definido e
 *   revisa diffs" — gerencia as próprias tarefas, dispara execuções, sem
 *   aprovar.
 * - `qa_engineer`: "cria/executa planos de teste e revisa falhas" — opera
 *   no nível de tarefa/execução (para rodar testes via IA), sem precisar
 *   ler a configuração completa do projeto (`architectureNotes`,
 *   `codeRules` — conteúdo de quem molda o projeto, não de quem testa).
 * - `product_manager`: "transforma requisitos em especificações
 *   executáveis" — gerencia tarefas, sem acesso a execução/aprovação de IA.
 *
 * `agent_run:cancel` (Fase 6) segue sempre o mesmo conjunto de papéis de
 * `agent_run:trigger`: quem pode iniciar uma execução de IA para uma tarefa
 * também pode interrompê-la — é a mesma superfície de controle sobre o
 * próprio disparo, não uma decisão de aprovação (`agent_run:approve`, que
 * continua restrita a `tech_lead`/`platform_engineer`). `product_manager`
 * não dispara execuções, então também não cancela.
 *
 * Fundação intencionalmente simples: o motor de políticas configurável por
 * organização (`roles.permissions` jsonb) é elaboração de fase futura
 * (Fase 14) — aqui o enum de sistema (`MemberRole`) basta.
 */
const ROLE_PERMISSIONS: Readonly<Record<MemberRole, readonly Permission[]>> = {
  admin: [...permissionSchema.options],
  platform_engineer: [
    'project:read',
    'task:read',
    'agent_run:trigger',
    'agent_run:approve',
    'agent_run:cancel',
    'ai_playground:use',
    'environment:deploy',
    'policy:manage',
    'audit_log:read',
  ],
  tech_lead: [
    'project:read',
    'project:write',
    'task:read',
    'task:manage',
    'agent_run:trigger',
    'agent_run:approve',
    'agent_run:cancel',
    'ai_playground:use',
    'audit_log:read',
  ],
  developer: ['project:read', 'task:read', 'task:manage', 'agent_run:trigger', 'agent_run:cancel'],
  qa_engineer: ['task:read', 'agent_run:trigger', 'agent_run:cancel'],
  product_manager: ['project:read', 'task:read', 'task:manage'],
};

/**
 * Decisão pura de RBAC: a `role` tem a `permission`? Não considera tenant
 * nem tipo de ferramenta — isso é composto em `authorizeToolCall`.
 */
export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
