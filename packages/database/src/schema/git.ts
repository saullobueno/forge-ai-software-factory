import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { fileChangeTypeEnum, pullRequestStatusEnum, repositoryProviderEnum } from './enums';
import { organizations } from './organizations';
import { projects, repositories } from './projects';
import { tasks } from './tasks';
import { workspaces } from './workspaces';
import { agentRuns } from './agents';

export const fileSnapshots = pgTable('file_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  contentHash: text('content_hash').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('file_snapshots_organization_id_idx').on(table.organizationId),
  index('file_snapshots_workspace_id_idx').on(table.workspaceId),
]);

export const codeChanges = pgTable('code_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  filePath: text('file_path').notNull(),
  changeType: fileChangeTypeEnum('change_type').notNull(),
  beforeSnapshotId: uuid('before_snapshot_id').references(() => fileSnapshots.id, {
    onDelete: 'set null',
  }),
  afterSnapshotId: uuid('after_snapshot_id').references(() => fileSnapshots.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('code_changes_organization_id_idx').on(table.organizationId),
  index('code_changes_workspace_id_idx').on(table.workspaceId),
  index('code_changes_agent_run_id_idx').on(table.agentRunId),
]);

export const diffs = pgTable('diffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  codeChangeId: uuid('code_change_id')
    .notNull()
    .references(() => codeChanges.id, { onDelete: 'cascade' }),
  patch: text('patch').notNull(),
  additions: integer('additions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('diffs_organization_id_idx').on(table.organizationId),
  index('diffs_code_change_id_idx').on(table.codeChangeId),
]);

export const pullRequests = pgTable('pull_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  provider: repositoryProviderEnum('provider').notNull(),
  externalNumber: integer('external_number'),
  externalUrl: text('external_url'),
  title: text('title').notNull(),
  description: text('description'),
  sourceBranch: text('source_branch').notNull(),
  targetBranch: text('target_branch').notNull(),
  status: pullRequestStatusEnum('status').notNull().default('draft'),
  mergedAt: timestamp('merged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pull_requests_organization_id_idx').on(table.organizationId),
  index('pull_requests_project_id_idx').on(table.projectId),
  index('pull_requests_repository_id_idx').on(table.repositoryId),
  index('pull_requests_status_idx').on(table.status),
]);
