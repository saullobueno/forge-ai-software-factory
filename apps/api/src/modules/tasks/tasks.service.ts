import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { hasPermission, nextTaskStatuses, transitionTaskStatus } from '@forge/domain';
import type { CreateTaskRequest, ListTasksQuery, MemberRole, TaskStatus, UpdateTaskRequest } from '@forge/types';
import { readProtectedProjectSlugs } from '../../infrastructure/config/env.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import type { AgentRunRow } from '../agent-runs/agent-runs.repository.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { UsersRepository } from '../users/users.repository.js';
import type { Page } from '../projects/projects.repository.js';
import {
  TasksRepository,
  type TaskActivityItem,
  type TaskCommentItem,
  type TaskListRow,
  type TaskRow,
  type TaskWithDependencies,
} from './tasks.repository.js';

export type TaskListItem = TaskListRow & {
  projectIsProtected: boolean;
  allowedNextStatuses: TaskStatus[];
};

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly agentRunsService: AgentRunsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * `undefined` tanto para "não existe" quanto para "existe em outra
   * organização" — mesmo motivo de `ProjectsService.findById`: o
   * controller responde 404 genérico nos dois casos.
   */
  async findById(taskId: string, organizationId: string): Promise<TaskWithDependencies | undefined> {
    return this.tasksRepository.findById(taskId, organizationId);
  }

  async listByProject(projectId: string, organizationId: string): Promise<TaskWithDependencies[]> {
    return this.tasksRepository.listByProject(projectId, organizationId);
  }

  /**
   * Quem chama já validou que `projectId` existe no tenant (mesmo 404
   * genérico de `ProjectsController`). Nasce em `ready`: o objetivo de criar
   * uma tarefa aqui é poder disparar uma execução de IA sobre ela.
   */
  async create(
    projectId: string,
    organizationId: string,
    actorUserId: string,
    input: CreateTaskRequest,
  ): Promise<TaskRow> {
    await this.assertAssigneeInOrganization(input.assigneeId, organizationId);
    const task = await this.tasksRepository.create({
      organizationId,
      projectId,
      title: input.title,
      description: input.description ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? null,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      labels: input.labels,
    });

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'task.created',
      targetType: 'task',
      targetId: task.id,
      metadata: { projectId, title: task.title, priority: task.priority },
    });

    return task;
  }

  async listByOrganization(organizationId: string, query: ListTasksQuery): Promise<Page<TaskListItem>> {
    const page = await this.tasksRepository.listByOrganization(organizationId, query);
    const protectedSlugs = readProtectedProjectSlugs();
    return {
      ...page,
      items: page.items.map((task) => ({
        ...task,
        projectIsProtected: protectedSlugs.has(task.projectSlug),
        allowedNextStatuses: [...nextTaskStatuses(task.status)],
      })),
    };
  }

  /**
   * Move a tarefa pela máquina de estados de `@forge/domain` (Kanban):
   * 409 para transição inválida, 403 no projeto de demonstração protegido.
   * `undefined` quando a tarefa não existe no tenant.
   */
  async changeStatus(
    taskId: string,
    organizationId: string,
    actorUserId: string,
    status: TaskStatus,
  ): Promise<TaskRow | undefined> {
    const current = await this.tasksRepository.findById(taskId, organizationId);
    if (!current) return undefined;
    await this.assertProjectNotProtected(taskId, organizationId);

    const transition = transitionTaskStatus(current.status, status);
    if (!transition.success) throw new ConflictException(transition.error);

    const updated = await this.tasksRepository.setStatus(taskId, organizationId, status);
    if (!updated) return undefined;

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'task.status_changed',
      targetType: 'task',
      targetId: taskId,
      metadata: { projectId: updated.projectId, from: current.status, to: status },
    });

    return updated;
  }

  private async assertAssigneeInOrganization(assigneeId: string | null | undefined, organizationId: string): Promise<void> {
    if (assigneeId === null || assigneeId === undefined) return;
    if (!(await this.usersRepository.existsInOrganization(assigneeId, organizationId))) {
      throw new BadRequestException('Responsável inválido para esta organização.');
    }
  }

  /**
   * Adiciona "esta tarefa depende de outra": mesma organização e mesmo
   * projeto, sem auto-dependência, sem duplicata e sem ciclo (percorre o
   * grafo a partir da tarefa alvo procurando de volta a tarefa atual).
   * `undefined` quando a tarefa não existe no tenant.
   */
  async addDependency(
    taskId: string,
    organizationId: string,
    actorUserId: string,
    dependsOnTaskId: string,
  ): Promise<TaskWithDependencies | undefined> {
    const task = await this.tasksRepository.findById(taskId, organizationId);
    if (!task) return undefined;
    await this.assertProjectNotProtected(taskId, organizationId);

    if (dependsOnTaskId === taskId) throw new BadRequestException('Uma tarefa não pode depender dela mesma.');
    const target = await this.tasksRepository.findById(dependsOnTaskId, organizationId);
    if (!target) throw new BadRequestException('Tarefa de dependência inválida.');
    if (target.projectId !== task.projectId) {
      throw new BadRequestException('A dependência precisa ser uma tarefa do mesmo projeto.');
    }
    if (task.dependencies.some((dependency) => dependency.dependsOnTaskId === dependsOnTaskId)) {
      throw new ConflictException('Esta dependência já existe.');
    }
    if (await this.reaches(dependsOnTaskId, taskId)) {
      throw new ConflictException('Essa dependência criaria um ciclo entre as tarefas.');
    }

    await this.tasksRepository.addDependency(taskId, dependsOnTaskId);
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'task.dependency_added',
      targetType: 'task',
      targetId: taskId,
      metadata: { projectId: task.projectId, dependsOnTaskId },
    });

    return this.tasksRepository.findById(taskId, organizationId);
  }

  /** `false` quando a tarefa ou a dependência não existem no tenant. */
  async removeDependency(
    taskId: string,
    organizationId: string,
    actorUserId: string,
    dependsOnTaskId: string,
  ): Promise<boolean> {
    const task = await this.tasksRepository.findById(taskId, organizationId);
    if (!task) return false;
    await this.assertProjectNotProtected(taskId, organizationId);

    const removed = await this.tasksRepository.removeDependency(taskId, dependsOnTaskId);
    if (!removed) return false;

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'task.dependency_removed',
      targetType: 'task',
      targetId: taskId,
      metadata: { projectId: task.projectId, dependsOnTaskId },
    });
    return true;
  }

  /** `undefined` quando a tarefa não existe no tenant. */
  async listComments(taskId: string, organizationId: string): Promise<TaskCommentItem[] | undefined> {
    if (!(await this.tasksRepository.findById(taskId, organizationId))) return undefined;
    return this.tasksRepository.listComments(taskId, organizationId);
  }

  /** Comentários ficam desligados no projeto de demonstração (contas públicas compartilhadas). */
  async addComment(
    taskId: string,
    organizationId: string,
    actorUserId: string,
    body: string,
  ): Promise<TaskCommentItem[] | undefined> {
    const task = await this.tasksRepository.findById(taskId, organizationId);
    if (!task) return undefined;

    const slug = await this.tasksRepository.findProjectSlug(taskId, organizationId);
    if (slug !== undefined && readProtectedProjectSlugs().has(slug)) {
      throw new ForbiddenException('Comentários estão desativados nas tarefas do projeto de demonstração.');
    }

    await this.tasksRepository.addComment({ organizationId, taskId, authorUserId: actorUserId, body });
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'task.comment_added',
      targetType: 'task',
      targetId: taskId,
      metadata: { projectId: task.projectId },
    });
    return this.tasksRepository.listComments(taskId, organizationId);
  }

  /** Só o autor ou quem tem `project:write` apaga; `false` quando o comentário não existe. */
  async deleteComment(
    taskId: string,
    commentId: string,
    organizationId: string,
    actor: { userId: string; role: MemberRole },
  ): Promise<boolean> {
    const comment = await this.tasksRepository.findComment(commentId, taskId, organizationId);
    if (!comment) return false;

    if (comment.authorUserId !== actor.userId && !hasPermission(actor.role, 'project:write')) {
      throw new ForbiddenException('Só o autor ou um tech lead/admin pode apagar este comentário.');
    }

    await this.tasksRepository.deleteComment(commentId);
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId: actor.userId,
      action: 'task.comment_deleted',
      targetType: 'task',
      targetId: taskId,
      metadata: { commentId },
    });
    return true;
  }

  async listActivity(taskId: string, organizationId: string): Promise<TaskActivityItem[] | undefined> {
    if (!(await this.tasksRepository.findById(taskId, organizationId))) return undefined;
    return this.tasksRepository.listActivity(taskId, organizationId);
  }

  /** `from` alcança `to` seguindo arestas "depende de"? (busca em largura) */
  private async reaches(from: string, to: string): Promise<boolean> {
    const visited = new Set<string>([from]);
    let frontier = [from];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const target of await this.tasksRepository.findDependencyTargets(id)) {
          if (target === to) return true;
          if (!visited.has(target)) {
            visited.add(target);
            next.push(target);
          }
        }
      }
      frontier = next;
    }
    return false;
  }

  /** Tarefas do projeto de demonstração protegido não podem ser editadas nem excluídas. */
  private async assertProjectNotProtected(taskId: string, organizationId: string): Promise<void> {
    const slug = await this.tasksRepository.findProjectSlug(taskId, organizationId);
    if (slug !== undefined && readProtectedProjectSlugs().has(slug)) {
      throw new ForbiddenException('Esta tarefa pertence ao projeto de demonstração e não pode ser editada nem excluída.');
    }
  }

  /** `undefined` quando a tarefa não existe no tenant (o controller responde 404 genérico). */
  async update(
    taskId: string,
    organizationId: string,
    actorUserId: string,
    input: UpdateTaskRequest,
  ): Promise<TaskRow | undefined> {
    await this.assertProjectNotProtected(taskId, organizationId);
    await this.assertAssigneeInOrganization(input.assigneeId, organizationId);
    const updated = await this.tasksRepository.update(taskId, organizationId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.acceptanceCriteria !== undefined ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.labels !== undefined ? { labels: input.labels } : {}),
    });
    if (!updated) return undefined;

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'task.updated',
      targetType: 'task',
      targetId: taskId,
      metadata: { projectId: updated.projectId, changedFields: Object.keys(input) },
    });

    return updated;
  }

  /**
   * `false` quando a tarefa não existe no tenant. Bloqueia (409) enquanto
   * houver execução de IA em andamento sobre ela.
   */
  async remove(taskId: string, organizationId: string, actorUserId: string): Promise<boolean> {
    const current = await this.tasksRepository.findById(taskId, organizationId);
    if (!current) return false;
    await this.assertProjectNotProtected(taskId, organizationId);

    if ((await this.tasksRepository.countActiveAgentRuns(taskId, organizationId)) > 0) {
      throw new ConflictException(
        'Há uma execução de IA em andamento nesta tarefa. Aguarde a conclusão ou cancele-a antes de excluir.',
      );
    }

    const deleted = await this.tasksRepository.deleteWithDependents(taskId, organizationId);
    if (!deleted) return false;

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'task.deleted',
      targetType: 'task',
      targetId: taskId,
      metadata: { projectId: current.projectId, title: current.title },
    });

    return true;
  }

  /**
   * Retorna `undefined` quando a tarefa não existe no tenant do chamador —
   * o controller decide o 404, esta camada não lança exceções HTTP.
   * `actorRole` é o papel de quem chamou `POST /tasks/:id/agent-runs` —
   * propagado até o orquestrador (Fase 7) para autorização real de cada
   * tool call (spec §8/§20), não um papel de "sistema" fixo.
   */
  async triggerAgentRun(
    taskId: string,
    organizationId: string,
    actorRole: MemberRole,
    actorUserId: string,
  ): Promise<AgentRunRow | undefined> {
    const task = await this.tasksRepository.findById(taskId, organizationId);
    if (!task) return undefined;

    return this.agentRunsService.triggerForTask(
      task,
      { role: actorRole, organizationId, userId: actorUserId },
      actorUserId,
    );
  }

  /**
   * `undefined` quando a tarefa não existe no tenant do chamador — mesmo
   * contrato de `findById`/`triggerAgentRun` acima, o controller decide o
   * 404. Confirma a existência da tarefa ANTES de listar (em vez de listar
   * direto por `taskId`) para nunca vazar "esta tarefa tem N execuções" de
   * uma tarefa de outra organização via uma lista vazia vs. 404
   * inconsistentes.
   */
  async listAgentRuns(taskId: string, organizationId: string): Promise<AgentRunRow[] | undefined> {
    const task = await this.tasksRepository.findById(taskId, organizationId);
    if (!task) return undefined;

    return this.agentRunsService.listForTask(taskId, organizationId);
  }
}
