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
}
