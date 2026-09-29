import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, schema } from '@forge/database';
import { ACTIVE_AGENT_RUN_STATUSES } from '../projects/projects.repository.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type TaskRow = typeof schema.tasks.$inferSelect;

export type TaskDependencyWithTarget = typeof schema.taskDependencies.$inferSelect & {
  dependsOnTask: TaskRow;
};

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

  async create(input: {
    organizationId: string;
    projectId: string;
    title: string;
    description: string | null;
    acceptanceCriteria: string | null;
    priority: TaskRow['priority'];
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
    patch: Partial<Pick<TaskRow, 'title' | 'description' | 'acceptanceCriteria' | 'priority'>>,
  ): Promise<TaskRow | undefined> {
    const [row] = await this.database.db
      .update(schema.tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)))
      .returning();
    return row;
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
