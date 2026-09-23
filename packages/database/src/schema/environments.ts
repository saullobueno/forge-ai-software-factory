import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { deploymentStatusEnum, environmentKindEnum } from './enums';
import { organizations, users } from './organizations';
import { projects } from './projects';
import { pullRequests } from './git';

export const environments = pgTable('environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  kind: environmentKindEnum('kind').notNull(),
  name: text('name').notNull(),
  url: text('url'),
  isProtected: boolean('is_protected').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('environments_organization_id_idx').on(table.organizationId),
  index('environments_project_id_idx').on(table.projectId),
]);

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  environmentId: uuid('environment_id')
    .notNull()
    .references(() => environments.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  pullRequestId: uuid('pull_request_id').references(() => pullRequests.id, {
    onDelete: 'set null',
  }),
  commitSha: text('commit_sha').notNull(),
  status: deploymentStatusEnum('status').notNull().default('queued'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  deployedByUserId: uuid('deployed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('deployments_organization_id_idx').on(table.organizationId),
  index('deployments_environment_id_idx').on(table.environmentId),
  index('deployments_status_idx').on(table.status),
]);
