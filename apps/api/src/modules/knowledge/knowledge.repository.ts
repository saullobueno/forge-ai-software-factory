import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  isNull,
  or,
  persistIndexedKnowledgeSources,
  schema,
  type PersistIndexedKnowledgeSourcesResult,
} from '@forge/database';
import type { IndexedKnowledgeSource, KnowledgeDocument } from '@forge/knowledge';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type KnowledgeSourceRow = typeof schema.knowledgeSources.$inferSelect;
export type KnowledgeChunkRow = typeof schema.knowledgeChunks.$inferSelect;
export type RepositoryRow = typeof schema.repositories.$inferSelect;

export type KnowledgeSourceWithChunks = KnowledgeSourceRow & {
  chunks: KnowledgeChunkRow[];
};

@Injectable()
export class KnowledgeRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Mesma consulta (3 linhas) já duplicada em `CodeRepository`/
   * `AgentRunsRepository`/`AgentRunOrchestrationStore` para "achar o
   * repositório real de um projeto" — nenhum desses módulos exporta a
   * própria `*Repository` para reuso cruzado (cada um é fino e
   * autocontido, mesmo padrão do resto do app), então duplicar aqui é
   * consistente com a convenção já estabelecida, não um atalho novo.
   */
  async findRepositoryForProject(projectId: string, organizationId: string): Promise<RepositoryRow | undefined> {
    return this.database.db.query.repositories.findFirst({
      where: and(eq(schema.repositories.projectId, projectId), eq(schema.repositories.organizationId, organizationId)),
    });
  }

  async persistReindexedSources(sources: readonly IndexedKnowledgeSource[]): Promise<PersistIndexedKnowledgeSourcesResult> {
    return persistIndexedKnowledgeSources(this.database.db, sources);
  }

  async listSourcesByProject(projectId: string, organizationId: string): Promise<KnowledgeSourceWithChunks[]> {
    return this.database.db.query.knowledgeSources.findMany({
      where: and(
        eq(schema.knowledgeSources.organizationId, organizationId),
        or(eq(schema.knowledgeSources.projectId, projectId), isNull(schema.knowledgeSources.projectId)),
      ),
      with: { chunks: { orderBy: [asc(schema.knowledgeChunks.chunkIndex)] } },
      orderBy: [asc(schema.knowledgeSources.kind), asc(schema.knowledgeSources.title)],
    });
  }

  async findDocumentsForRetrieval(projectId: string, organizationId: string): Promise<KnowledgeDocument[]> {
    const sources = await this.listSourcesByProject(projectId, organizationId);

    return sources.flatMap((source) =>
      source.chunks.map((chunk) => ({
        sourceId: source.id,
        organizationId: source.organizationId,
        projectId: source.projectId,
        workspaceId: source.workspaceId,
        kind: source.kind,
        title: source.title,
        uri: source.uri,
        version: source.version,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        embedding: chunk.embedding,
      })),
    );
  }
}
