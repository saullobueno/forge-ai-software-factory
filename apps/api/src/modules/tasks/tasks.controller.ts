import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { idSchema } from '@forge/types';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get(':id')
  @RequirePermission('task:read')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    // Id malformado também vira 404 genérico — mesma regra de
    // `ProjectsController.findById` (nunca 400, que distinguiria "formato
    // inválido" de "não existe" para quem chama).
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const task = await this.tasksService.findById(id, user.organizationId);
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return task;
  }

  /**
   * Cria um `agentRun` em `queued` para a tarefa (spec §7/§9) e enfileira
   * um job real que `AgentRunWorkerService` consome para processá-la de
   * ponta a ponta (Fase 7 — `AgentRunOrchestrator` de `@forge/agents`).
   */
  @Post(':id/agent-runs')
  @RequirePermission('agent_run:trigger')
  async triggerAgentRun(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const agentRun = await this.tasksService.triggerAgentRun(id, user.organizationId, user.role);
    if (!agentRun) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return agentRun;
  }

  /**
   * Lista as execuções de IA já disparadas para uma tarefa (Fase 6, mais
   * recentes primeiro — ver `AgentRunsRepository.listByTask`). Detalhe
   * completo de uma execução (steps + tool calls) é
   * `GET /agent-runs/:id`, não este endpoint.
   */
  @Get(':id/agent-runs')
  @RequirePermission('task:read')
  async listAgentRuns(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const agentRuns = await this.tasksService.listAgentRuns(id, user.organizationId);
    if (!agentRuns) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return agentRuns;
  }
}
