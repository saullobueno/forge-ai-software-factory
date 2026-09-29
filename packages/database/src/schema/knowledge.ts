import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { knowledgeSourceKindEnum } from './enums.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { workspaces } from './workspaces.ts';

export const knowledgeSources = pgTable('knowledge_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: knowledgeSourceKindEnum('kind').notNull(),
  title: text('title').notNull(),
  uri: text('uri').notNull(),
  version: text('version'),
  /**
   * SHA-256 (hex) do conteúdo real por trás desta fonte (`IndexedKnowledgeSource.contentHash`,
   * `@forge/knowledge`) — permite detectar staleness real num reindex sob
   * demanda (arquivo já indexado que mudou desde a última vez). Nullable
   * para não quebrar fontes seedadas antes desta coluna existir; nesse caso
   * o reindex trata a ausência de hash como "desatualizado" e regrava os
   * chunks na primeira passada, preenchendo o hash a partir daí.
   */
  contentHash: text('content_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('knowledge_sources_organization_id_idx').on(table.organizationId),
  index('knowledge_sources_project_id_idx').on(table.projectId),
]);

/**
 * Conteúdo recuperado via KnowledgeChunk é não confiável (spec §14) e nunca
 * pode sobrescrever políticas de sistema/segurança — a aplicação deve
 * sempre tratar `content` como dado, nunca como instrução.
 */
export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledgeSourceId: uuid('knowledge_source_id')
    .notNull()
    .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  tokenCount: integer('token_count'),
  /**
   * Embedding determinístico local do chunk (`embedText`, `@forge/knowledge`
   * — "hashing trick"/feature hashing, NÃO um embedding semântico real, ver
   * a doc daquele módulo), tamanho fixo (`EMBEDDING_DIMENSIONS`, 256).
   * `jsonb` em vez de um tipo array nativo do Postgres (`real[]`): mesma
   * convenção já usada em todo este schema para "lista de valores de
   * tamanho variável/estruturado" (`allowedTools`/`labels`/`permissions`
   * string[], `rules`/`scope` objetos — ver `agents.ts`/`organizations.ts`/
   * `tasks.ts`/`policies.ts`), suportado de forma idêntica por PGlite e
   * Postgres real sem depender de nenhuma extensão (`pgvector` não é usado
   * aqui, de propósito — ver PROGRESS.md), e sem exigir um tipo Drizzle
   * diferente de todo o resto deste arquivo. Nullable: chunks legados
   * (seedados/persistidos antes desta coluna existir) ou nunca reindexados
   * desde então ficam `null` — `retrieveKnowledge()` degrada para o score
   * puramente lexical nesse caso, sem erro.
   */
  embedding: jsonb('embedding').$type<number[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('knowledge_chunks_knowledge_source_id_idx').on(table.knowledgeSourceId)]);
