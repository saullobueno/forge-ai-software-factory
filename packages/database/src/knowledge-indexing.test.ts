import { EMBEDDING_DIMENSIONS, embedText, type IndexedKnowledgeSource } from '@forge/knowledge';
import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from './client.ts';
import { persistIndexedKnowledgeSources } from './knowledge-indexing.ts';
import { knowledgeChunks, knowledgeSources, organizations, projects } from './schema/index.ts';

/**
 * Teste de integração real (mesmo padrão de `schema/integration.test.ts`):
 * sobe um PGlite real num diretório temporário isolado e aplica as
 * migrações geradas, incluindo `0004_nice_silver_fox.sql` (`content_hash`).
 * Exercita `persistIndexedKnowledgeSources` diretamente com fontes
 * fabricadas (não lidas de disco — `indexing.test.ts`, em `@forge/knowledge`,
 * já cobre a leitura real de arquivo + cálculo de `contentHash`) para provar
 * os três caminhos reais de staleness: fonte nova, fonte igual (no-op),
 * fonte que mudou (chunks reescritos, nunca acumulados).
 */
let db: Database;
let closeDatabase: () => Promise<void>;
let dataDir: string;
let organizationId: string;
let projectId: string;

function buildSource(
  overrides: { content: string; embedding?: number[] } & Partial<Omit<IndexedKnowledgeSource, 'chunks' | 'contentHash'>>,
): IndexedKnowledgeSource {
  const { content, embedding, ...rest } = overrides;
  return {
    organizationId,
    projectId,
    workspaceId: null,
    kind: 'repository_doc',
    title: 'src/lib/example.ts',
    uri: 'repo://knowledge-indexing-test/src/lib/example.ts',
    version: null,
    ...rest,
    contentHash: `hash-of:${content}`,
    chunks: [
      {
        knowledgeSourceId: 'placeholder',
        content,
        chunkIndex: 0,
        tokenCount: 3,
        hasPromptInjectionRisk: false,
        ...(embedding !== undefined ? { embedding } : {}),
      },
    ],
  };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'forge-db-knowledge-indexing-'));
  process.env['DATABASE_LOCAL_PATH'] = join(dataDir, 'forge-knowledge-indexing-test.pglite');

  const { createDatabase } = await import('./client.ts');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const created = createDatabase();
  db = created.db;
  closeDatabase = created.close;

  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: './drizzle' });

  const [organization] = await db
    .insert(organizations)
    .values({ name: 'Knowledge Indexing Test', slug: 'knowledge-indexing-test' })
    .returning();
  if (!organization) throw new Error('organization não inserida');
  organizationId = organization.id;

  const [project] = await db
    .insert(projects)
    .values({ organizationId, name: 'Knowledge Indexing Test Project', slug: 'knowledge-indexing-test-project' })
    .returning();
  if (!project) throw new Error('project não inserido');
  projectId = project.id;
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env['DATABASE_LOCAL_PATH'];
});

describe('persistIndexedKnowledgeSources (PGlite + migrações reais)', () => {
  it('cria uma fonte nova com seus chunks e contentHash', async () => {
    const result = await persistIndexedKnowledgeSources(db, [buildSource({ content: 'export const a = 1;' })]);

    expect(result).toEqual({ createdSourceCount: 1, updatedSourceCount: 0, unchangedSourceCount: 0, createdChunkCount: 1, updatedChunkCount: 0 });

    const row = await db.query.knowledgeSources.findFirst({
      where: eq(knowledgeSources.uri, 'repo://knowledge-indexing-test/src/lib/example.ts'),
      with: { chunks: true },
    });
    if (!row) throw new Error('knowledge source não encontrada após criação');
    expect(row.contentHash).toBe('hash-of:export const a = 1;');
    expect(row.chunks).toHaveLength(1);
    expect(row.chunks[0]?.content).toBe('export const a = 1;');
  });

  it('reindexar com o MESMO conteúdo (mesmo contentHash) não toca nos chunks — a fonte já está em dia', async () => {
    const before = await db.query.knowledgeSources.findFirst({
      where: eq(knowledgeSources.uri, 'repo://knowledge-indexing-test/src/lib/example.ts'),
      with: { chunks: true },
    });
    if (!before) throw new Error('knowledge source do teste anterior não encontrada');

    const result = await persistIndexedKnowledgeSources(db, [buildSource({ content: 'export const a = 1;' })]);

    expect(result).toEqual({ createdSourceCount: 0, updatedSourceCount: 0, unchangedSourceCount: 1, createdChunkCount: 0, updatedChunkCount: 0 });

    const after = await db.query.knowledgeSources.findFirst({
      where: eq(knowledgeSources.uri, 'repo://knowledge-indexing-test/src/lib/example.ts'),
      with: { chunks: true },
    });
    if (!after) throw new Error('knowledge source deveria continuar existindo');
    // Mesma linha de chunk (nunca deletada/reinserida) — mesmo `id`, prova
    // direta de que nada foi reescrito para uma fonte não-stale.
    expect(after.chunks.map((chunk) => chunk.id)).toEqual(before.chunks.map((chunk) => chunk.id));
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('reindexar com conteúdo DIFERENTE (contentHash mudou) reescreve os chunks, sem duplicar a fonte', async () => {
    const result = await persistIndexedKnowledgeSources(db, [buildSource({ content: 'export const a = 2; // mudou' })]);

    expect(result).toEqual({ createdSourceCount: 0, updatedSourceCount: 1, unchangedSourceCount: 0, createdChunkCount: 0, updatedChunkCount: 1 });

    const sourceRows = await db.query.knowledgeSources.findMany({
      where: eq(knowledgeSources.organizationId, organizationId),
    });
    expect(sourceRows).toHaveLength(1);

    const row = sourceRows[0];
    if (!row) throw new Error('knowledge source deveria existir');
    expect(row.contentHash).toBe('hash-of:export const a = 2; // mudou');

    const chunks = await db.query.knowledgeChunks.findMany({
      where: eq(knowledgeChunks.knowledgeSourceId, row.id),
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('export const a = 2; // mudou');
  });

  it('fonte existente sem contentHash (legado, seedada antes desta coluna existir) é tratada como stale e ganha hash real', async () => {
    const [legacySource] = await db
      .insert(knowledgeSources)
      .values({
        organizationId,
        projectId,
        workspaceId: null,
        kind: 'readme',
        title: 'README.md',
        uri: 'repo://knowledge-indexing-test/README.md',
        version: null,
        contentHash: null,
      })
      .returning();
    if (!legacySource) throw new Error('legacySource não inserida');
    await db.insert(knowledgeChunks).values({
      knowledgeSourceId: legacySource.id,
      content: 'conteúdo legado escrito à mão, sem contentHash',
      chunkIndex: 0,
      tokenCount: 5,
    });

    const result = await persistIndexedKnowledgeSources(db, [
      buildSource({
        title: 'README.md',
        uri: 'repo://knowledge-indexing-test/README.md',
        content: 'conteúdo real vindo do arquivo, com hash de verdade',
      }),
    ]);

    expect(result.updatedSourceCount).toBe(1);
    expect(result.createdSourceCount).toBe(0);

    const updated = await db.query.knowledgeSources.findFirst({
      where: eq(knowledgeSources.id, legacySource.id),
      with: { chunks: true },
    });
    if (!updated) throw new Error('fonte legada deveria continuar existindo (mesmo id)');
    expect(updated.contentHash).toBe('hash-of:conteúdo real vindo do arquivo, com hash de verdade');
    expect(updated.chunks).toHaveLength(1);
    expect(updated.chunks[0]?.content).toBe('conteúdo real vindo do arquivo, com hash de verdade');
  });

  it('persiste e recupera o embedding real de um chunk (jsonb, array de floats de tamanho fixo, ida e volta pelo PGlite)', async () => {
    const embedding = embedText('conteúdo real do chunk usado para o embedding');
    await persistIndexedKnowledgeSources(db, [
      buildSource({
        title: 'src/lib/embedding-example.ts',
        uri: 'repo://knowledge-indexing-test/src/lib/embedding-example.ts',
        content: 'conteúdo real do chunk usado para o embedding',
        embedding,
      }),
    ]);

    const row = await db.query.knowledgeSources.findFirst({
      where: eq(knowledgeSources.uri, 'repo://knowledge-indexing-test/src/lib/embedding-example.ts'),
      with: { chunks: true },
    });
    if (!row) throw new Error('knowledge source não encontrada após criação');

    expect(row.chunks).toHaveLength(1);
    expect(row.chunks[0]?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    // Ida e volta pelo PGlite real (jsonb) precisa preservar o vetor
    // exatamente, número a número — nunca truncado/arredondado.
    expect(row.chunks[0]?.embedding).toEqual(embedding);
  });

  it('fonte sem embedding calculado (chunk construído manualmente, sem passar por chunkKnowledge) persiste embedding null, sem erro', async () => {
    await persistIndexedKnowledgeSources(db, [
      buildSource({
        title: 'src/lib/no-embedding-example.ts',
        uri: 'repo://knowledge-indexing-test/src/lib/no-embedding-example.ts',
        content: 'conteúdo sem embedding calculado',
      }),
    ]);

    const row = await db.query.knowledgeSources.findFirst({
      where: eq(knowledgeSources.uri, 'repo://knowledge-indexing-test/src/lib/no-embedding-example.ts'),
      with: { chunks: true },
    });
    if (!row) throw new Error('knowledge source não encontrada após criação');

    expect(row.chunks).toHaveLength(1);
    expect(row.chunks[0]?.embedding).toBeNull();
  });
});
