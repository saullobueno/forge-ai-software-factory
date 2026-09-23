import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { idSchema } from '@forge/types';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { ProjectsService } from './projects.service.js';

/**
 * Endpoint mínimo (não é o CRUD completo de projetos — isso é Fase 4).
 * Existe para provar isolamento de tenant de ponta a ponta contra um
 * banco real: um usuário só enxerga projetos da própria organização.
 */
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
}
