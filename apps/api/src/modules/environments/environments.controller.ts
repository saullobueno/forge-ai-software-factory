import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { idSchema } from '@forge/types';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { EnvironmentsService } from './environments.service.js';

@Controller('projects/:projectId/environments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Get()
  @RequirePermission('project:read')
  async list(@Param('projectId') projectId: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(projectId).success) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    return this.environmentsService.listByProject(projectId, user.organizationId);
  }
}
