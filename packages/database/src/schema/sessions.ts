import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizations, users } from './organizations.ts';

/**
 * Sessões de login revogáveis. O JWT de acesso (curto) carrega o `id` da
 * sessão (`sid`) e só vale enquanto esta linha não estiver revogada/vencida;
 * o refresh token (opaco, rotativo) só existe aqui como hash SHA-256.
 */
export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  /** Hash do refresh token anterior: apresentá-lo depois da janela de tolerância indica roubo (reuso) e revoga a sessão. */
  previousRefreshTokenHash: text('previous_refresh_token_hash'),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  /** Validade deslizante do refresh token (limitada por `createdAt` + teto absoluto). */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedReason: text('revoked_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('user_sessions_user_id_idx').on(table.userId),
  index('user_sessions_organization_id_idx').on(table.organizationId),
  uniqueIndex('user_sessions_refresh_token_hash_idx').on(table.refreshTokenHash),
]);
