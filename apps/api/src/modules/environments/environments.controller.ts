import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import {
  deploymentDecisionRequestSchema,
  idSchema,
  requestDeploymentSchema,
  type DeploymentDecisionRequest,
  type RequestDeployment,
} from '@forge/types';
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

  /**
   * Decisão humana sobre o gate de aprovação de um deployment parado em
   * `queued` (spec §13). `environment:approve_deployment` é uma permissão
   * deliberadamente diferente de `environment:deploy` (que só autoriza
   * SOLICITAR) — ver `packages/domain/src/permissions.ts` para o
   * raciocínio completo. `HttpCode(200)`: decidir é uma atualização de
   * estado sobre um recurso já existente, não uma criação (mesmo padrão de
   * `AgentRunsController.approve`/`.cancel`).
   */
  @Post(':environmentId/deployments/:deploymentId/approve')
  @HttpCode(200)
  @RequirePermission('environment:approve_deployment')
  async approveDeployment(
    @Param('projectId') projectId: string,
    @Param('environmentId') environmentId: string,
    @Param('deploymentId') deploymentId: string,
    @Body(new ZodValidationPipe(deploymentDecisionRequestSchema)) body: DeploymentDecisionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idSchema.safeParse(projectId).success) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    if (!idSchema.safeParse(environmentId).success) {
      throw new NotFoundException('Ambiente não encontrado.');
    }
    if (!idSchema.safeParse(deploymentId).success) {
      throw new NotFoundException('Deployment não encontrado.');
    }

    return this.environmentsService.approveDeployment(
      projectId,
      environmentId,
      deploymentId,
      user.organizationId,
      user.userId,
      body.reason ?? null,
    );
  }

  @Post(':environmentId/deployments/:deploymentId/reject')
  @HttpCode(200)
  @RequirePermission('environment:approve_deployment')
  async rejectDeployment(
    @Param('projectId') projectId: string,
    @Param('environmentId') environmentId: string,
    @Param('deploymentId') deploymentId: string,
    @Body(new ZodValidationPipe(deploymentDecisionRequestSchema)) body: DeploymentDecisionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idSchema.safeParse(projectId).success) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    if (!idSchema.safeParse(environmentId).success) {
      throw new NotFoundException('Ambiente não encontrado.');
    }
    if (!idSchema.safeParse(deploymentId).success) {
      throw new NotFoundException('Deployment não encontrado.');
    }

    return this.environmentsService.rejectDeployment(
      projectId,
      environmentId,
      deploymentId,
      user.organizationId,
      user.userId,
      body.reason ?? null,
    );
  }
}
