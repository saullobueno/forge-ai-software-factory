import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { AiUsageService } from './ai-usage.service.js';

@Controller('ai-usage')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiUsageController {
  constructor(private readonly aiUsageService: AiUsageService) {}

  @Get('summary')
  @RequirePermission('audit_log:read')
  async summary(@CurrentUser() user: AuthenticatedUser) {
    return this.aiUsageService.summarizeByOrganization(user.organizationId);
  }

  /**
   * Uso do PRÓPRIO usuário autenticado nas últimas 24h (Fase 13
   * continuação #7) — sem `@RequirePermission`, de propósito: é o dado do
   * PRÓPRIO usuário, não um agregado da organização (que continua exigindo
   * `audit_log:read` em `/summary` acima). Qualquer papel autenticado,
   * incluindo `developer`, pode consultar o quão perto está do próprio
   * limite (`AI_USER_DAILY_*`) antes de bater nele.
   */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.aiUsageService.summarizeForUser(user.organizationId, user.userId);
  }

  /**
   * Provider/modelo ATUALMENTE configurado no processo da API (leitura de
   * env, read-only) — mesmo raciocínio de `/me` acima: não é um agregado
   * de organização (não consulta `ai_usages`/banco nenhum, é o mesmo para
   * qualquer organização deste processo), então não exige
   * `audit_log:read`. Qualquer usuário autenticado pode ver qual
   * provider/modelo será usado ao disparar uma execução de agente.
   */
  @Get('provider-config')
  providerConfig() {
    return this.aiUsageService.getProviderConfig();
  }
}
