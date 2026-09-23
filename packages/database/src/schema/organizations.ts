import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { memberRoleEnum } from './enums';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('organizations_slug_idx').on(table.slug)]);

/**
 * Modelo simplificado da Fase 1: um usuário pertence a exatamente uma
 * organização. Multi-tenancy real por usuário (vários memberships) é
 * fundação da Fase 2 (Auth/RBAC).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: memberRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('users_organization_id_idx').on(table.organizationId),
  uniqueIndex('users_email_idx').on(table.email),
]);

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('teams_organization_id_idx').on(table.organizationId)]);

/**
 * Join de User <-> Team. Estruturalmente necessário para Team ter membros;
 * não está na lista literal de entidades da spec §16.
 */
export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('team_members_team_id_user_id_idx').on(table.teamId, table.userId),
  index('team_members_user_id_idx').on(table.userId),
]);

/**
 * Função customizável por organização (spec §3 "Funções"). Atribuição
 * granular a usuários é fundação da Fase 2 — por ora `users.role` usa o
 * enum de sistema (memberRole).
 */
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().$type<string[]>().default([]),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('roles_organization_id_idx').on(table.organizationId)]);
