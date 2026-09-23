import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { idSchema, paginationRequestSchema, type PaginationRequest } from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { ProjectsService } from './projects.service.js';
import { TasksService } from '../tasks/tasks.service.js';

/**
 * Fase 2 só tinha `GET /projects/:id` (prova de isolamento de tenant de
 * ponta a ponta). Fase 4 adiciona a listagem paginada e as tarefas de um
 * projeto — ainda não é o CRUD completo de projetos (escrita/edição de
 * `techProfile`/`architectureNotes`/`codeRules` continua fora de escopo).
 */
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
  ) {}

  @Get()
  @RequirePermission('project:read')
  async list(
    @Query(new ZodValidationPipe(paginationRequestSchema)) pagination: PaginationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.listByOrganization(user.organizationId, pagination);
  }

  @Get(':id')
  @RequirePermission('project:read')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    // Um id malformado também vira 404 genérico — nunca 400, que
    // distinguiria "formato inválido" de "não existe" para quem chama.
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    const project = await this.projectsService.findById(id, user.organizationId);
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    return project;
  }

  /**
   * Reaproveita exatamente a mesma checagem de tenant/existência de
   * `findById` (mesmo 404 genérico) antes de listar as tarefas — um
   * projeto de outra organização nunca deve vazar nem a própria
   * existência, nem sua lista de tarefas.
   */
  @Get(':id/tasks')
  @RequirePermission('project:read')
  async tasks(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    const project = await this.projectsService.findById(id, user.organizationId);
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    return this.tasksService.listByProject(project.id, user.organizationId);
  }
}
