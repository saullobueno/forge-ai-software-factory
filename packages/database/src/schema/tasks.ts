import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { taskPriorityEnum, taskStatusEnum } from './enums.ts';
import { organizations, users } from './organizations.ts';
import { projects } from './projects.ts';

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  acceptanceCriteria: text('acceptance_criteria'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  labels: jsonb('labels').notNull().$type<string[]>().default([]),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  status: taskStatusEnum('status').notNull().default('backlog'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('tasks_organization_id_idx').on(table.organizationId),
  index('tasks_project_id_idx').on(table.projectId),
  index('tasks_assignee_id_idx').on(table.assigneeId),
  index('tasks_status_idx').on(table.status),
]);

export const taskDependencies = pgTable('task_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  dependsOnTaskId: uuid('depends_on_task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('task_dependencies_task_id_depends_on_task_id_idx').on(
    table.taskId,
    table.dependsOnTaskId,
  ),
  index('task_dependencies_depends_on_task_id_idx').on(table.dependsOnTaskId),
]);
