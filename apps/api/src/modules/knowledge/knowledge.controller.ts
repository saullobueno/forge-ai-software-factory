import { Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { idSchema } from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ProjectRow } from '../projects/projects.repository.js';
import { ProjectsService } from '../projects/projects.service.js';
import { knowledgeSearchQuerySchema, type KnowledgeSearchQuery } from './knowledge-query.schemas.js';
import { KnowledgeService } from './knowledge.service.js';

@Controller('projects/:id/knowledge')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KnowledgeController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  private async requireProject(id: string, organizationId: string): Promise<ProjectRow> {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    const project = await this.projectsService.findById(id, organizationId);
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    return project;
  }

  @Get()
  @RequirePermission('project:read')
  async list(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const project = await this.requireProject(id, user.organizationId);
    return this.knowledgeService.listSources(project.id, user.organizationId);
  }

  @Get('search')
  @RequirePermission('project:read')
  async search(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(knowledgeSearchQuerySchema)) query: KnowledgeSearchQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const project = await this.requireProject(id, user.organizationId);
    return this.knowledgeService.search(project.id, user.organizationId, query.q, query.limit);
  }

  /**
   * Reindex sob demanda (Fase 12, pendência explícita). `project:write` — a
   * mesma permissão de RBAC já modelada desde a Fase 2 para "quem molda a
   * configuração de um projeto" (`tech_lead`/`admin`), e que até esta
   * continuação não tinha nenhum endpoint real que a exigisse. Reaproveitada
   * em vez de criar uma permissão nova: reindexar conhecimento é uma ação de
   * escrita sobre a configuração do projeto, não sobre execuções de IA
   * (`agent_run:*`) nem sobre deploy (`environment:*`). `HttpCode(200)`:
   * mesmo raciocínio já usado por `AgentRunsController.cancel`/`.approve` —
   * o default do Nest para `@Post` é 201 (criação), mas isto é uma operação
   * sobre um recurso já existente, não a criação de um novo.
   */
  @Post('reindex')
  @RequirePermission('project:write')
  @HttpCode(200)
  async reindex(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const project = await this.requireProject(id, user.organizationId);
    return this.knowledgeService.reindex(project.id, user.organizationId, user.userId);
  }
}
