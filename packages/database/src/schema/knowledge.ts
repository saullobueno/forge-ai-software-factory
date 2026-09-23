import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('knowledge_chunks_knowledge_source_id_idx').on(table.knowledgeSourceId)]);
