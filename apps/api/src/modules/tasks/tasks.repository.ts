import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, schema } from '@forge/database';
import type { ListTasksQuery, TaskStatus } from '@forge/types';
import { decodeCursor, encodeCursor } from '../../infrastructure/pagination/cursor.js';
import { ACTIVE_AGENT_RUN_STATUSES, type Page } from '../projects/projects.repository.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type TaskRow = typeof schema.tasks.$inferSelect;

export type TaskDependencyWithTarget = typeof schema.taskDependencies.$inferSelect & {
  dependsOnTask: TaskRow;
};

export interface TaskCommentItem {
  id: string;
  body: string;
  createdAt: Date;
  authorUserId: string | null;
  authorName: string | null;
}

export interface TaskActivityItem {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actorName: string | null;
}

export type TaskListRow = TaskRow & { projectName: string; projectSlug: string };

export type TaskWithDependencies = TaskRow & {
  dependencies: TaskDependencyWithTarget[];
};

/**
 * Camada de acesso a dados para Task (Fase 4). Mesmo padrão de tenant
 * scoping de `ProjectsRepository`: `organizationId` faz parte do próprio
 * `WHERE`, nunca uma checagem posterior em memória.
 */
@Injectable()
export class TasksRepository {
  constructor(private readonly database: DatabaseService) {}

  async findById(taskId: string, organizationId: string): Promise<TaskWithDependencies | undefined> {
    return this.database.db.query.tasks.findFirst({
      where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)),
      with: { dependencies: { with: { dependsOnTask: true } } },
    });
  }

  /**
   * Tarefas de um projeto (spec §6/§7), com as dependências de cada uma
   * (spec §7 "dependências"). `projectId` E `organizationId` no `WHERE` —
   * redundante em teoria (um projeto já pertence a uma única organização,
   * validado por quem chama antes de listar), mas defesa em profundidade
   * barata: um bug em outro lugar que esqueça de validar o projeto não
   * consegue vazar tarefas de outro tenant por aqui.
   */
  async listByProject(projectId: string, organizationId: string): Promise<TaskWithDependencies[]> {
    return this.database.db.query.tasks.findMany({
      where: and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.organizationId, organizationId)),
      with: { dependencies: { with: { dependsOnTask: true } } },
      orderBy: [asc(schema.tasks.createdAt)],
    });
  }

  /**
   * Lista global de tarefas da organização (Kanban/lista), com filtros e
   * paginação keyset por `(createdAt desc, id desc)` — mesma técnica de
   * `ProjectsRepository.listByOrganization`.
   */
  async listByOrganization(organizationId: string, query: ListTasksQuery): Promise<Page<TaskListRow>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const escaped = query.q?.replace(/[\\%_]/g, '\\$&');

    const rows = await this.database.db
      .select({ task: schema.tasks, projectName: schema.projects.name, projectSlug: schema.projects.slug })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(
        and(
          eq(schema.tasks.organizationId, organizationId),
          query.projectId ? eq(schema.tasks.projectId, query.projectId) : undefined,
          query.status ? eq(schema.tasks.status, query.status) : undefined,
          query.priority ? eq(schema.tasks.priority, query.priority) : undefined,
          query.assigneeId === 'none'
            ? isNull(schema.tasks.assigneeId)
            : query.assigneeId
              ? eq(schema.tasks.assigneeId, query.assigneeId)
              : undefined,
          escaped ? ilike(schema.tasks.title, `%${escaped}%`) : undefined,
          cursor
            ? or(
                lt(schema.tasks.createdAt, cursor.createdAt),
                and(eq(schema.tasks.createdAt, cursor.createdAt), lt(schema.tasks.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(schema.tasks.createdAt), desc(schema.tasks.id))
      .limit(query.limit + 1);

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    const items = pageRows.map((row) => ({ ...row.task, projectName: row.projectName, projectSlug: row.projectSlug }));
    const last = items.at(-1);
    const nextCursor = hasNextPage && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  /** Ids das tarefas de que `taskId` depende (arestas de saída do grafo de dependências). */
  async findDependencyTargets(taskId: string): Promise<string[]> {
    const rows = await this.database.db
      .select({ id: schema.taskDependencies.dependsOnTaskId })
      .from(schema.taskDependencies)
      .where(eq(schema.taskDependencies.taskId, taskId));
    return rows.map((row) => row.id);
  }

  async addDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await this.database.db.insert(schema.taskDependencies).values({ taskId, dependsOnTaskId });
  }

  async removeDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
    const removed = await this.database.db
      .delete(schema.taskDependencies)
      .where(and(eq(schema.taskDependencies.taskId, taskId), eq(schema.taskDependencies.dependsOnTaskId, dependsOnTaskId)))
      .returning();
    return removed.length > 0;
  }

  async listComments(taskId: string, organizationId: string): Promise<TaskCommentItem[]> {
    return this.database.db
      .select({
        id: schema.taskComments.id,
        body: schema.taskComments.body,
        createdAt: schema.taskComments.createdAt,
        authorUserId: schema.taskComments.authorUserId,
        authorName: schema.users.name,
      })
      .from(schema.taskComments)
      .leftJoin(schema.users, eq(schema.users.id, schema.taskComments.authorUserId))
      .where(and(eq(schema.taskComments.taskId, taskId), eq(schema.taskComments.organizationId, organizationId)))
      .orderBy(asc(schema.taskComments.createdAt), asc(schema.taskComments.id));
  }

  async addComment(input: { organizationId: string; taskId: string; authorUserId: string; body: string }): Promise<string> {
    const [row] = await this.database.db.insert(schema.taskComments).values(input).returning();
    if (!row) throw new Error('Falha ao inserir o comentário.');
    return row.id;
  }

  async findComment(commentId: string, taskId: string, organizationId: string) {
    const [row] = await this.database.db
      .select()
      .from(schema.taskComments)
      .where(
        and(
          eq(schema.taskComments.id, commentId),
          eq(schema.taskComments.taskId, taskId),
          eq(schema.taskComments.organizationId, organizationId),
        ),
      );
    return row;
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.database.db.delete(schema.taskComments).where(eq(schema.taskComments.id, commentId));
  }

  /** Eventos de auditoria da própria tarefa, mais recentes primeiro, com o nome de quem agiu. */
  async listActivity(taskId: string, organizationId: string): Promise<TaskActivityItem[]> {
    return this.database.db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        metadata: schema.auditLogs.metadata,
        createdAt: schema.auditLogs.createdAt,
        actorName: schema.users.name,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.actorUserId))
      .where(
        and(
          eq(schema.auditLogs.organizationId, organizationId),
          eq(schema.auditLogs.targetType, 'task'),
          eq(schema.auditLogs.targetId, taskId),
        ),
      )
      .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
      .limit(100);
  }

  async setStatus(taskId: string, organizationId: string, status: TaskStatus): Promise<TaskRow | undefined> {
    const [row] = await this.database.db
      .update(schema.tasks)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)))
      .returning();
    return row;
  }

  async create(input: {
    organizationId: string;
    projectId: string;
    title: string;
    description: string | null;
    acceptanceCriteria: string | null;
    priority: TaskRow['priority'];
    assigneeId: string | null;
    labels: string[];
  }): Promise<TaskRow> {
    const [task] = await this.database.db
      .insert(schema.tasks)
      .values({ ...input, status: 'ready' })
      .returning();
    if (!task) throw new Error('Falha ao inserir a tarefa.');
    return task;
  }

  async update(
    taskId: string,
    organizationId: string,
    patch: Partial<Pick<TaskRow, 'title' | 'description' | 'acceptanceCriteria' | 'priority' | 'assigneeId' | 'labels'>>,
  ): Promise<TaskRow | undefined> {
    const [row] = await this.database.db
      .update(schema.tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)))
      .returning();
    return row;
  }

  async findProjectSlug(taskId: string, organizationId: string): Promise<string | undefined> {
    const [row] = await this.database.db
      .select({ slug: schema.projects.slug })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)));
    return row?.slug;
  }

  async countActiveAgentRuns(taskId: string, organizationId: string): Promise<number> {
    const rows = await this.database.db
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.taskId, taskId),
          eq(schema.agentRuns.organizationId, organizationId),
          inArray(schema.agentRuns.status, ACTIVE_AGENT_RUN_STATUSES),
        ),
      );
    return rows.length;
  }

  /** Remove também as aprovações polimórficas (sem FK) das execuções da tarefa. */
  async deleteWithDependents(taskId: string, organizationId: string): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      const runIds = tx.select({ id: schema.agentRuns.id }).from(schema.agentRuns).where(eq(schema.agentRuns.taskId, taskId));

      await tx
        .delete(schema.approvals)
        .where(
          and(
            eq(schema.approvals.organizationId, organizationId),
            eq(schema.approvals.subjectType, 'agent_run'),
            inArray(schema.approvals.subjectId, runIds),
          ),
        );

      const deleted = await tx
        .delete(schema.tasks)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)))
        .returning();
      return deleted.length > 0;
    });
  }
}
