import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { ApprovalsService } from './approvals.service.js';

/**
 * `GET /approvals/pending` (Fase 17 continuação #2): painel cross-execução
 * — lista, numa única resposta, toda `approval` `pending` da organização do
 * usuário autenticado, seja de execução de IA (`agent_run`) ou de
 * deployment (`deployment`). Não é um recurso por id (é uma listagem
 * agregada), então o 404 genérico cross-tenant não se aplica aqui: o
 * isolamento de tenant já acontece dentro do repositório
 * (`organizationId` no `WHERE`).
 *
 * `agent_run:approve` OU `environment:approve_deployment` (semântica OU de
 * `RequirePermission` — ver o comentário ali): entra quem tem QUALQUER UMA
 * das duas. `ApprovalsService.listPending` decide, por dentro, quais
 * sub-listas cada role específica pode efetivamente ver.
 */
@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get('pending')
  @RequirePermission('agent_run:approve', 'environment:approve_deployment')
  async pending(@CurrentUser() user: AuthenticatedUser) {
    return this.approvalsService.listPending(user.organizationId, user.role);
  }
}
