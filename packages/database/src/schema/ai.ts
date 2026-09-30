import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { aiMessageRoleEnum } from './enums.ts';
import { organizations, users } from './organizations.ts';
import { agentRuns, agentSteps, toolCalls } from './agents.ts';

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  agentStepId: uuid('agent_step_id').references(() => agentSteps.id, { onDelete: 'cascade' }),
  toolCallId: uuid('tool_call_id').references(() => toolCalls.id, { onDelete: 'set null' }),
  role: aiMessageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ai_messages_organization_id_idx').on(table.organizationId),
  index('ai_messages_agent_step_id_idx').on(table.agentStepId),
]);

export const aiUsages = pgTable('ai_usages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
  agentStepId: uuid('agent_step_id').references(() => agentSteps.id, { onDelete: 'cascade' }),
  aiMessageId: uuid('ai_message_id').references(() => aiMessages.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ai_usages_organization_id_idx').on(table.organizationId),
  index('ai_usages_agent_run_id_idx').on(table.agentRunId),
]);

/** Conjunto de casos do AI Playground, com histórico: cada edição cria uma nova versão imutável. */
export const playgroundDatasets = pgTable('playground_datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('playground_datasets_organization_id_idx').on(table.organizationId)]);

export const playgroundDatasetVersions = pgTable('playground_dataset_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  datasetId: uuid('dataset_id')
    .notNull()
    .references(() => playgroundDatasets.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  items: jsonb('items').notNull().$type<{ id: string; title: string; input: string; expectedKeywords: string[] }[]>(),
  note: text('note'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('playground_dataset_versions_organization_id_idx').on(table.organizationId),
  uniqueIndex('playground_dataset_versions_dataset_version_idx').on(table.datasetId, table.version),
]);
