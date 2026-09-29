import type { IndexedKnowledgeSource } from '@forge/knowledge';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from './client.ts';
import { knowledgeChunks, knowledgeSources } from './schema/index.ts';

export interface PersistIndexedKnowledgeSourcesResult {
  createdSourceCount: number;
  updatedSourceCount: number;
  unchangedSourceCount: number;
  createdChunkCount: number;
  updatedChunkCount: number;
}

/**
 * Persiste de forma idempotente e com detecção real de staleness um lote de
 * fontes já indexadas por `indexKnowledgeFiles()` (`@forge/knowledge`) — o
 * único ponto que grava `knowledge_sources`/`knowledge_chunks` a partir de
 * arquivos reais, reaproveitado tanto pelo seed (`packages/database/src/
 * seed/run-seed.ts`) quanto pelo reindex sob demanda via API
 * (`POST /projects/:id/knowledge/reindex`, `apps/api`), para nunca duplicar
 * esta lógica de idempotência/staleness.
 *
 * Uma fonte é identificada por `(organizationId, projectId, uri)` — a mesma
 * tripla já usada desde a versão manual original. Três casos reais:
 * 1. Fonte nova (nenhuma linha com essa tripla): INSERT de `knowledge_sources`
 *    (já com `contentHash`) + INSERT de todos os chunks.
 * 2. Fonte já existente e "stale" — `contentHash` armazenado é `null`
 *    (fonte seedada antes desta coluna existir, ou uma inserção anterior que
 *    falhou entre os dois INSERTs e nunca chegou a gravar nenhum chunk) OU
 *    diferente do `contentHash` novo (o arquivo real mudou desde a última
 *    indexação): os chunks antigos são DELETADOS e os novos INSERIDOS (nunca
 *    acumulados/duplicados), e `contentHash`/`title`/`kind`/`version` da
 *    linha são atualizados.
 * 3. Fonte já existente e não-stale (`contentHash` igual e já tem pelo menos
 *    um chunk): não faz nada — é exatamente o caso "arquivo não mudou desde
 *    a última indexação", o ponto central de por que este reindex é real e
 *    não um recurso "meio pronto" que só soubesse adicionar fontes novas.
 */
export async function persistIndexedKnowledgeSources(
  db: Database,
  sources: readonly IndexedKnowledgeSource[],
): Promise<PersistIndexedKnowledgeSourcesResult> {
  let createdSourceCount = 0;
  let updatedSourceCount = 0;
  let unchangedSourceCount = 0;
  let createdChunkCount = 0;
  let updatedChunkCount = 0;

  for (const source of sources) {
    const existing = await db.query.knowledgeSources.findFirst({
      where: and(
        eq(knowledgeSources.organizationId, source.organizationId),
        source.projectId === null ? isNull(knowledgeSources.projectId) : eq(knowledgeSources.projectId, source.projectId),
        eq(knowledgeSources.uri, source.uri),
      ),
      with: { chunks: true },
    });

    if (!existing) {
      const [row] = await db
        .insert(knowledgeSources)
        .values({
          organizationId: source.organizationId,
          projectId: source.projectId,
          workspaceId: source.workspaceId,
          kind: source.kind,
          title: source.title,
          uri: source.uri,
          version: source.version,
          contentHash: source.contentHash,
        })
        .returning();
      if (!row) throw new Error(`Falha ao inserir knowledge source "${source.title}" (${source.uri}).`);

      await db.insert(knowledgeChunks).values(
        source.chunks.map((chunk) => ({
          knowledgeSourceId: row.id,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          // `chunk.embedding` já vem calculado por `chunkKnowledge()`
          // (`@forge/knowledge`, `embedText`) — nunca recalculado aqui, para
          // não duplicar a lógica de embedding. `?? null` só cobre o caso de
          // um `PreparedKnowledgeChunk` construído manualmente sem esse
          // campo (ex. fixtures de teste).
          embedding: chunk.embedding ?? null,
        })),
      );

      createdSourceCount += 1;
      createdChunkCount += source.chunks.length;
      continue;
    }

    const isStale = existing.contentHash !== source.contentHash || existing.chunks.length === 0;
    if (!isStale) {
      unchangedSourceCount += 1;
      continue;
    }

    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.knowledgeSourceId, existing.id));
    await db.insert(knowledgeChunks).values(
      source.chunks.map((chunk) => ({
        knowledgeSourceId: existing.id,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        embedding: chunk.embedding ?? null,
      })),
    );
    await db
      .update(knowledgeSources)
      .set({
        title: source.title,
        kind: source.kind,
        version: source.version,
        contentHash: source.contentHash,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, existing.id));

    updatedSourceCount += 1;
    updatedChunkCount += source.chunks.length;
  }

  return { createdSourceCount, updatedSourceCount, unchangedSourceCount, createdChunkCount, updatedChunkCount };
}
