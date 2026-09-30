import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { memberRoleEnum } from './enums.ts';
import { organizations, users } from './organizations.ts';

/**
 * Convites para entrar na organização. O token em texto puro só existe na
 * resposta da criação: aqui fica apenas o hash SHA-256 (um vazamento do banco
 * não permite aceitar convites).
 */
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: memberRoleEnum('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('invitations_organization_id_idx').on(table.organizationId),
  uniqueIndex('invitations_token_hash_idx').on(table.tokenHash),
]);
