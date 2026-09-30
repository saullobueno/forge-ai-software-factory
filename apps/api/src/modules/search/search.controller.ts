import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { hasPermission } from '@forge/domain';
import { searchQuerySchema, type SearchQuery } from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { SearchRepository } from './search.repository.js';

const MIN_QUERY_LENGTH = 2;

@Controller('search')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SearchController {
  constructor(private readonly searchRepository: SearchRepository) {}

  /**
   * Busca global (paleta Ctrl+K): projetos, tarefas e execuções de IA da
   * organização. Projetos só entram para quem tem `project:read`.
   */
  @Get()
  @RequirePermission('task:read')
  async search(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (query.q.length < MIN_QUERY_LENGTH) return { projects: [], tasks: [], agentRuns: [] };

    const [projects, tasks, agentRuns] = await Promise.all([
      hasPermission(user.role, 'project:read') ? this.searchRepository.projects(user.organizationId, query.q) : [],
      this.searchRepository.tasks(user.organizationId, query.q),
      this.searchRepository.runs(user.organizationId, query.q),
    ]);
    return { projects, tasks, agentRuns };
  }
}
