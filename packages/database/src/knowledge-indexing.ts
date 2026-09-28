import type { IndexedKnowledgeSource } from '@forge/knowledge';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from './client.ts';
import { knowledgeChunks, knowledgeSources } from './schema/index.ts';

export interface PersistIndexedKnowledgeSourcesResult {
  createdSourceCount: number;
  createdChunkCount: number;
}

/**
 * Persiste de forma idempotente um lote de fontes já indexadas por
 * `indexKnowledgeFiles()` (`@forge/knowledge`, Fase 12 continuação) — o
 * único ponto que grava `knowledge_sources`/`knowledge_chunks` a partir de
 * arquivos reais, reaproveitado tanto pelo seed (`packages/database/src/
 * seed/run-seed.ts`) quanto por um reindex sob demanda via API
 * (`apps/api`), para nunca duplicar esta lógica de idempotência.
 *
 * Uma fonte é identificada por `(organizationId, projectId, uri)` — a
 * mesma tripla que já era usada manualmente antes desta continuação.
 * Reindexar o mesmo arquivo não cria uma segunda linha em `knowledge_sources`;
 * só grava chunks quando a fonte é criada agora ou quando já existia mas
 * ainda não tinha nenhum chunk (mesma regra que o seed manual já seguia).
 */
export async function persistIndexedKnowledgeSources(
  db: Database,
  sources: readonly IndexedKnowledgeSource[],
): Promise<PersistIndexedKnowledgeSourcesResult> {
  let createdSourceCount = 0;
  let createdChunkCount = 0;

  for (const source of sources) {
    const existing = await db.query.knowledgeSources.findFirst({
      where: and(
        eq(knowledgeSources.organizationId, source.organizationId),
        source.projectId === null ? isNull(knowledgeSources.projectId) : eq(knowledgeSources.projectId, source.projectId),
        eq(knowledgeSources.uri, source.uri),
      ),
      with: { chunks: true },
    });

    const row =
      existing ??
      (
        await db
          .insert(knowledgeSources)
          .values({
            organizationId: source.organizationId,
            projectId: source.projectId,
            workspaceId: source.workspaceId,
            kind: source.kind,
            title: source.title,
            uri: source.uri,
            version: source.version,
          })
          .returning()
      )[0];
    if (!row) throw new Error(`Falha ao inserir knowledge source "${source.title}" (${source.uri}).`);
    if (!existing) createdSourceCount += 1;
    if (existing && existing.chunks.length > 0) continue;

    await db.insert(knowledgeChunks).values(
      source.chunks.map((chunk) => ({
        knowledgeSourceId: row.id,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
      })),
    );
    createdChunkCount += source.chunks.length;
  }

  return { createdSourceCount, createdChunkCount };
}
