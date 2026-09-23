import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { TechProfile } from '@forge/types';
import { repositoryProviderEnum } from './enums';
import { organizations } from './organizations';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  techProfile: jsonb('tech_profile')
    .notNull()
    .$type<TechProfile>()
    .default({ languages: [], frameworks: [], packageManager: null }),
  architectureNotes: text('architecture_notes'),
  codeRules: text('code_rules'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('projects_organization_id_idx').on(table.organizationId)]);

/**
 * "Um projeto possui vínculos com repositórios" (spec §6) — modelado aqui
 * como Repository pertencendo a um único Project (suficiente para o
 * portfólio; múltiplos repos por projeto continuam suportados via várias
 * linhas de Repository apontando para o mesmo projectId).
 */
export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  provider: repositoryProviderEnum('provider').notNull(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  url: text('url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('repositories_organization_id_idx').on(table.organizationId),
  index('repositories_project_id_idx').on(table.projectId),
]);
