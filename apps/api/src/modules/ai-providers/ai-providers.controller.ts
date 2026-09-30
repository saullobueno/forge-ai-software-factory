import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { AiProviderRegistry } from './ai-provider.registry.js';

@Controller('ai/providers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiProvidersController {
  constructor(private readonly registry: AiProviderRegistry) {}

  /** Provedores disponíveis neste servidor (nunca expõe chaves). */
  @Get()
  @RequirePermission('project:read')
  list() {
    return this.registry.available();
  }
}
