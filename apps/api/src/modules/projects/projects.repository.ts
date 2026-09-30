import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, like, lt, or, schema } from '@forge/database';
import type { PaginationRequest, TechProfile } from '@forge/types';
import { decodeCursor, encodeCursor } from '../../infrastructure/pagination/cursor.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type ProjectRow = typeof schema.projects.$inferSelect;

export const ACTIVE_AGENT_RUN_STATUSES: (typeof schema.agentRuns.$inferSelect)['status'][] = [
  'queued',
  'planning',
  'executing',
  'testing',
  'review',
];

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Camada de acesso a dados para Project (Fase 2 provou isolamento de tenant
 * de ponta a ponta com `findById`; Fase 4 adiciona a listagem paginada).
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

  /**
   * Paginação keyset por `(createdAt desc, id desc)` — estável mesmo se
   * novos projetos forem criados entre páginas (diferente de `OFFSET`, que
   * pode pular ou repetir itens). Busca `limit + 1` linhas para saber se
   * existe próxima página sem uma segunda query de `COUNT`.
   */
  async listByOrganization(organizationId: string, pagination: PaginationRequest): Promise<Page<ProjectRow>> {
    const cursor = pagination.cursor ? decodeCursor(pagination.cursor) : null;

    const tenantFilter = eq(schema.projects.organizationId, organizationId);
    const where = cursor
      ? and(
          tenantFilter,
          or(
            lt(schema.projects.createdAt, cursor.createdAt),
            and(eq(schema.projects.createdAt, cursor.createdAt), lt(schema.projects.id, cursor.id)),
          ),
        )
      : tenantFilter;

    const rows = await this.database.db.query.projects.findMany({
      where,
      orderBy: [desc(schema.projects.createdAt), desc(schema.projects.id)],
      limit: pagination.limit + 1,
    });

    const hasNextPage = rows.length > pagination.limit;
    const items = hasNextPage ? rows.slice(0, pagination.limit) : rows;
    const last = items.at(-1);
    const nextCursor = hasNextPage && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  async update(
    projectId: string,
    organizationId: string,
    patch: Partial<Pick<ProjectRow, 'name' | 'description' | 'techProfile' | 'architectureNotes' | 'codeRules' | 'aiProvider'>>,
  ): Promise<ProjectRow | undefined> {
    const [row] = await this.database.db
      .update(schema.projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
      .returning();
    return row;
  }

  /** Execuções de IA ainda em andamento (não terminais) sobre qualquer tarefa do projeto. */
  async countActiveAgentRuns(projectId: string, organizationId: string): Promise<number> {
    const rows = await this.database.db
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.agentRuns.taskId))
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          eq(schema.agentRuns.organizationId, organizationId),
          inArray(schema.agentRuns.status, ACTIVE_AGENT_RUN_STATUSES),
        ),
      );
    return rows.length;
  }

  /**
   * As FKs em cascata removem tarefas, repositório, ambientes, conhecimento
   * etc. `approvals` aponta de forma polimórfica (sem FK) para execuções e
   * deployments, então suas linhas são removidas explicitamente na mesma
   * transação para não deixar aprovações órfãs na fila.
   */
  async deleteWithDependents(projectId: string, organizationId: string): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      const runIds = tx
        .select({ id: schema.agentRuns.id })
        .from(schema.agentRuns)
        .innerJoin(schema.tasks, eq(schema.tasks.id, schema.agentRuns.taskId))
        .where(eq(schema.tasks.projectId, projectId));
      const deploymentIds = tx
        .select({ id: schema.deployments.id })
        .from(schema.deployments)
        .where(eq(schema.deployments.projectId, projectId));

      await tx.delete(schema.approvals).where(
        and(
          eq(schema.approvals.organizationId, organizationId),
          or(
            and(eq(schema.approvals.subjectType, 'agent_run'), inArray(schema.approvals.subjectId, runIds)),
            and(eq(schema.approvals.subjectType, 'deployment'), inArray(schema.approvals.subjectId, deploymentIds)),
          ),
        ),
      );

      const deleted = await tx
        .delete(schema.projects)
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
        .returning();
      return deleted.length > 0;
    });
  }

  async findSlugsWithPrefix(organizationId: string, prefix: string): Promise<string[]> {
    const rows = await this.database.db
      .select({ slug: schema.projects.slug })
      .from(schema.projects)
      .where(and(eq(schema.projects.organizationId, organizationId), like(schema.projects.slug, `${prefix}%`)));
    return rows.map((row) => row.slug);
  }

  /**
   * Projeto + repositório demo na mesma transação: um projeto sem
   * repositório nunca existe pela metade (o explorador de código e as
   * execuções de IA dependem dele).
   */
  async createWithDemoRepository(input: {
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
    techProfile: TechProfile;
  }): Promise<ProjectRow> {
    return this.database.db.transaction(async (tx) => {
      const [project] = await tx
        .insert(schema.projects)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          techProfile: input.techProfile,
        })
        .returning();
      if (!project) throw new Error('Falha ao inserir o projeto.');

      await tx.insert(schema.repositories).values({
        organizationId: input.organizationId,
        projectId: project.id,
        provider: 'mock',
        owner: DEMO_REPOSITORY.owner,
        name: DEMO_REPOSITORY.name,
        defaultBranch: 'main',
        url: DEMO_REPOSITORY.url,
      });

      return project;
    });
  }
}

/**
 * Todo projeto criado pela UI é vinculado ao mesmo repositório demo do seed
 * (`fixtures/acme-platform-web/`, provider `mock`): é ele que alimenta o
 * explorador de código, o conhecimento e as execuções de IA. Cada projeto
 * ganha a própria linha de `repositories`, então cópias de workspace e
 * branches do `MockGitProvider` (chaveados por `repositoryId`) não se misturam.
 */
const DEMO_REPOSITORY = {
  owner: 'acme-platform',
  name: 'acme-platform-web',
  url: 'mock://acme-platform/acme-platform-web',
} as const;
