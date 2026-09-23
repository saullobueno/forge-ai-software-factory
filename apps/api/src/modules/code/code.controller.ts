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
import { filePathQuerySchema, searchQuerySchema, type FilePathQuery, type SearchQuery } from './code-query.schemas.js';
import { CodeService } from './code.service.js';

/**
 * Fase 5 — "Inteligência de código" (spec §10): árvore do repositório,
 * leitura de arquivo (com símbolos top-level quando aplicável), busca
 * simples por substring e o diff real já seedado. Somente leitura — não
 * existe (e não deveria existir nesta fase) nenhum endpoint de escrita;
 * isso é Fase 7/8, quando agentes de verdade aplicam patches via runner.
 */
@Controller('projects/:id/repository')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CodeController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly codeService: CodeService,
  ) {}

  /**
   * Mesma checagem de `ProjectsController` — id malformado ou projeto de
   * outra organização nunca se distinguem de "não existe" para quem chama
   * (404 genérico nos dois casos).
   */
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

  @Get('tree')
  @RequirePermission('project:read')
  async tree(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const project = await this.requireProject(id, user.organizationId);
    return this.codeService.getTree(project.id, user.organizationId);
  }

  /**
   * `path` é o único parâmetro que chega direto do cliente e vira um
   * caminho de arquivo em disco — `CodeService`/`RepositoryFsService`
   * confinam a resolução dentro do diretório do repositório demo (nunca
   * permitem `../` escapar), sempre com 404 genérico em caso de tentativa
   * de traversal (ver `repository-fs.service.ts` e o teste e2e dedicado).
   */
  @Get('file')
  @RequirePermission('project:read')
  async file(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(filePathQuerySchema)) query: FilePathQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const project = await this.requireProject(id, user.organizationId);
    return this.codeService.getFile(project.id, user.organizationId, query.path);
  }

  @Get('search')
  @RequirePermission('project:read')
  async search(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const project = await this.requireProject(id, user.organizationId);
    return this.codeService.search(project.id, user.organizationId, query.q);
  }

  @Get('diff')
  @RequirePermission('project:read')
  async diff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const project = await this.requireProject(id, user.organizationId);
    return this.codeService.getDiffs(project.id, user.organizationId);
  }
}
