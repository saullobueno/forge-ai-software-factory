import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
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
}
