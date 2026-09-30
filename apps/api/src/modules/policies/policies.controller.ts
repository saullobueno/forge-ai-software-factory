import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { agentToolNameSchema, updateToolPolicyRequestSchema, type UpdateToolPolicyRequest } from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { PoliciesService } from './policies.service.js';

/** Políticas de ferramentas dos agentes (Configurações → Políticas). */
@Controller('policies/tools')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  @RequirePermission('policy:manage')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.policiesService.listTools(user.organizationId);
  }

  @Put(':toolName')
  @RequirePermission('policy:manage')
  async update(
    @Param('toolName') toolName: string,
    @Body(new ZodValidationPipe(updateToolPolicyRequestSchema)) body: UpdateToolPolicyRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = agentToolNameSchema.safeParse(toolName);
    if (!parsed.success) throw new NotFoundException('Ferramenta não encontrada.');
    return this.policiesService.setToolDecision(user.organizationId, user.userId, parsed.data, body.decision);
  }
}
