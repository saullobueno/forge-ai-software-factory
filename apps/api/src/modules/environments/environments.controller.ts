import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { idSchema, requestDeploymentSchema, type RequestDeployment } from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
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

  @Post(':environmentId/deployments')
  @RequirePermission('environment:deploy')
  async requestDeployment(
    @Param('projectId') projectId: string,
    @Param('environmentId') environmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestDeploymentSchema)) body: RequestDeployment,
  ) {
    if (!idSchema.safeParse(projectId).success) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    if (!idSchema.safeParse(environmentId).success) {
      throw new NotFoundException('Ambiente não encontrado.');
    }

    return this.environmentsService.requestDeployment(
      projectId,
      environmentId,
      user.organizationId,
      user.userId,
      body,
    );
  }
}
