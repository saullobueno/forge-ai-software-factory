import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type RepositoryRow = typeof schema.repositories.$inferSelect;

export type CodeChangeWithDiffs = typeof schema.codeChanges.$inferSelect & {
  diffs: (typeof schema.diffs.$inferSelect)[];
  beforeSnapshot: typeof schema.fileSnapshots.$inferSelect | null;
  afterSnapshot: typeof schema.fileSnapshots.$inferSelect | null;
};

/**
 * Camada de acesso a dados do `CodeModule` (Fase 5). Mesmo padrão de
 * tenant scoping do resto do app: `organizationId` sempre dentro do
 * `WHERE`, nunca uma checagem posterior em memória.
 */
@Injectable()
export class CodeRepository {
  constructor(private readonly database: DatabaseService) {}

  async findRepositoryForProject(projectId: string, organizationId: string): Promise<RepositoryRow | undefined> {
    return this.database.db.query.repositories.findFirst({
      where: and(eq(schema.repositories.projectId, projectId), eq(schema.repositories.organizationId, organizationId)),
    });
  }

  /**
   * `codeChanges`/`diffs` não têm `projectId` diretamente — chegam até o
   * projeto via `workspace` (`codeChanges.workspaceId` -> `workspaces.id`,
   * `workspaces.projectId`). Por isso a busca é em duas etapas: primeiro os
   * workspaces do projeto (já filtrados por tenant), depois os
   * `codeChanges` (também filtrados por tenant, redundante de propósito —
   * mesma defesa em profundidade de `TasksRepository.listByProject`) cujo
   * `workspaceId` está nesse conjunto.
   */
  async findCodeChangesForProject(projectId: string, organizationId: string): Promise<CodeChangeWithDiffs[]> {
    const workspaceRows = await this.database.db.query.workspaces.findMany({
      where: and(eq(schema.workspaces.projectId, projectId), eq(schema.workspaces.organizationId, organizationId)),
      columns: { id: true },
    });

    const workspaceIds = workspaceRows.map((row) => row.id);
    if (workspaceIds.length === 0) return [];

    return this.database.db.query.codeChanges.findMany({
      where: and(
        eq(schema.codeChanges.organizationId, organizationId),
        inArray(schema.codeChanges.workspaceId, workspaceIds),
      ),
      with: { diffs: true, beforeSnapshot: true, afterSnapshot: true },
      orderBy: [desc(schema.codeChanges.createdAt)],
    });
  }
}
