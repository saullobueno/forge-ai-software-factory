import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorTypeEnum } from './enums.ts';
import { organizations, users } from './organizations.ts';

/**
 * Registro de auditoria imutável (spec §20) — só `createdAt`, sem
 * `updatedAt`, pois um AuditLog nunca é alterado após criado.
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  actorType: actorTypeEnum('actor_type').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_logs_organization_id_idx').on(table.organizationId),
  index('audit_logs_target_idx').on(table.targetType, table.targetId),
]);
