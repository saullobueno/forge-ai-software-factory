import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { testArtifactKindEnum, testRunStatusEnum } from './enums.ts';
import { organizations, users } from './organizations.ts';
import { projects } from './projects.ts';
import { workspaces } from './workspaces.ts';
import { agentRuns } from './agents.ts';

export const testRuns = pgTable('test_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  status: testRunStatusEnum('status').notNull().default('queued'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('test_runs_organization_id_idx').on(table.organizationId),
  index('test_runs_project_id_idx').on(table.projectId),
  index('test_runs_status_idx').on(table.status),
]);

export const testSuites = pgTable('test_suites', {
  id: uuid('id').primaryKey().defaultRandom(),
  testRunId: uuid('test_run_id')
    .notNull()
    .references(() => testRuns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: testRunStatusEnum('status').notNull().default('queued'),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  durationMs: integer('duration_ms'),
  isFlaky: boolean('is_flaky').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('test_suites_test_run_id_idx').on(table.testRunId)]);

export const testArtifacts = pgTable('test_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  testRunId: uuid('test_run_id')
    .notNull()
    .references(() => testRuns.id, { onDelete: 'cascade' }),
  testSuiteId: uuid('test_suite_id').references(() => testSuites.id, { onDelete: 'cascade' }),
  kind: testArtifactKindEnum('kind').notNull(),
  name: text('name').notNull(),
  storageKey: text('storage_key').notNull(),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('test_artifacts_test_run_id_idx').on(table.testRunId),
  index('test_artifacts_test_suite_id_idx').on(table.testSuiteId),
]);
