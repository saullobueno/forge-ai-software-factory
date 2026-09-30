import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  addTaskDependencyRequestSchema,
  changeTaskStatusRequestSchema,
  createTaskCommentRequestSchema,
  idSchema,
  listTasksQuerySchema,
  updateTaskRequestSchema,
  type AddTaskDependencyRequest,
  type ChangeTaskStatusRequest,
  type CreateTaskCommentRequest,
  type ListTasksQuery,
  type UpdateTaskRequest,
} from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
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

  /** Lista global de tarefas da organização (lista/Kanban), com filtros e cursor. */
  @Get()
  @RequirePermission('task:read')
  async list(
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.listByOrganization(user.organizationId, query);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('task:manage')
  async changeStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeTaskStatusRequestSchema)) body: ChangeTaskStatusRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const task = await this.tasksService.changeStatus(id, user.organizationId, user.userId, body.status);
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return task;
  }

  @Post(':id/dependencies')
  @RequirePermission('task:manage')
  async addDependency(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addTaskDependencyRequestSchema)) body: AddTaskDependencyRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const task = await this.tasksService.addDependency(id, user.organizationId, user.userId, body.dependsOnTaskId);
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return task;
  }

  @Delete(':id/dependencies/:dependsOnTaskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('task:manage')
  async removeDependency(
    @Param('id') id: string,
    @Param('dependsOnTaskId') dependsOnTaskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(dependsOnTaskId).success) {
      throw new NotFoundException('Dependência não encontrada.');
    }

    const removed = await this.tasksService.removeDependency(id, user.organizationId, user.userId, dependsOnTaskId);
    if (!removed) {
      throw new NotFoundException('Dependência não encontrada.');
    }
  }

  @Get(':id/comments')
  @RequirePermission('task:read')
  async listComments(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    const comments = await this.tasksService.listComments(id, user.organizationId);
    if (!comments) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    return comments;
  }

  @Post(':id/comments')
  @RequirePermission('task:read')
  async addComment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createTaskCommentRequestSchema)) body: CreateTaskCommentRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    const comments = await this.tasksService.addComment(id, user.organizationId, user.userId, body.body);
    if (!comments) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    return comments;
  }

  @Delete(':id/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('task:read')
  async deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(commentId).success) {
      throw new NotFoundException('Comentário não encontrado.');
    }
    const removed = await this.tasksService.deleteComment(id, commentId, user.organizationId, {
      userId: user.userId,
      role: user.role,
    });
    if (!removed) {
      throw new NotFoundException('Comentário não encontrado.');
    }
  }

  /** Histórico de atividade da tarefa (eventos de auditoria dela). */
  @Get(':id/activity')
  @RequirePermission('task:read')
  async activity(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    const activity = await this.tasksService.listActivity(id, user.organizationId);
    if (!activity) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    return activity;
  }

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

  @Patch(':id')
  @RequirePermission('task:manage')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskRequestSchema)) body: UpdateTaskRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const task = await this.tasksService.update(id, user.organizationId, user.userId, body);
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    return task;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('task:manage')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const removed = await this.tasksService.remove(id, user.organizationId, user.userId);
    if (!removed) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
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

    const agentRun = await this.tasksService.triggerAgentRun(id, user.organizationId, user.role, user.userId);
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
