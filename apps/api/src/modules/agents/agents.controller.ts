import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { idSchema, updateAgentRequestSchema, type UpdateAgentRequest } from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { AgentsService } from './agents.service.js';

/** Configuração dos agentes da organização (Configurações → Agentes). Só `policy:manage`. */
@Controller('agents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @RequirePermission('policy:manage')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.agentsService.list(user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('policy:manage')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAgentRequestSchema)) body: UpdateAgentRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idSchema.safeParse(id).success) throw new NotFoundException('Agente não encontrado.');
    return this.agentsService.update(id, user.organizationId, user.userId, body);
  }
}
