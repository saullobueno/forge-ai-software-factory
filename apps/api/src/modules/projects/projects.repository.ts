import { Injectable } from '@nestjs/common';
import { and, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type ProjectRow = typeof schema.projects.$inferSelect;

/**
 * Camada de acesso a dados para Project (Fase 2 — só o suficiente para
 * provar isolamento de tenant de ponta a ponta; CRUD completo é Fase 4).
 * `organizationId` faz parte do próprio `WHERE`, não é uma checagem
 * posterior em memória — um bug em outro lugar do código não consegue
 * "esquecer" o filtro de tenant, porque a query nem busca a linha errada.
 */
@Injectable()
export class ProjectsRepository {
  constructor(private readonly database: DatabaseService) {}

  async findById(projectId: string, organizationId: string): Promise<ProjectRow | undefined> {
    return this.database.db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)),
    });
  }
}
