import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaceStatusEnum } from './enums';
import { organizations } from './organizations';
import { projects, repositories } from './projects';
import { tasks } from './tasks';

/**
 * Contexto de execução isolado (spec §6): branch/worktree, tarefa
 * selecionada, execução do agente, arquivos alterados, logs e artefatos.
 */
export const workspaces = pgTable('workspaces', {
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
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  branchName: text('branch_name').notNull(),
  worktreePath: text('worktree_path'),
  status: workspaceStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('workspaces_organization_id_idx').on(table.organizationId),
  index('workspaces_project_id_idx').on(table.projectId),
  index('workspaces_task_id_idx').on(table.taskId),
]);
