import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@forge/types';

export const REQUIRED_PERMISSION_KEY = 'forge:required_permission';

/**
 * Declara a(s) permissão(ões) (`@forge/domain` `hasPermission`) exigida(s)
 * para um handler/controller. Avaliada por `PermissionsGuard` — precisa
 * rodar depois de `JwtAuthGuard` na lista de `@UseGuards(...)` para que
 * `request.user` já exista.
 *
 * Aceita mais de um argumento com semântica OU (basta ter UMA delas) —
 * usado pela primeira vez em `GET /approvals/pending` (Fase 17 continuação
 * #2, `ApprovalsController`): o painel cross-execução é acessível a quem
 * tem `agent_run:approve` OU `environment:approve_deployment`, já que um
 * usuário pode legitimamente ter só uma das duas (ex.: `tech_lead` nunca
 * tem `environment:approve_deployment`). Todo call site anterior continua
 * passando um único argumento — comportamento idêntico ao de antes, já que
 * "OU" sobre um conjunto de um item é o mesmo que exigir aquele item.
 */
export const RequirePermission = (...permissions: readonly Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permissions);
