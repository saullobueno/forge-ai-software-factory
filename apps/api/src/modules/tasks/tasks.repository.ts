import { Injectable } from '@nestjs/common';
import { and, asc, eq, schema } from '@forge/database';
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
}
