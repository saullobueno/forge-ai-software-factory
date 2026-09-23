import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { approvalStatusEnum, approvalSubjectTypeEnum } from './enums.ts';
import { organizations, users } from './organizations.ts';

/**
 * Aprovação humana sobre uma entidade (referência polimórfica via
 * subjectType/subjectId — spec §13 ambientes protegidos, §18 ações
 * destrutivas). Sem FK de banco em subjectId pois aponta para tabelas
 * distintas conforme subjectType; a integridade é garantida na camada de
 * aplicação.
 */
export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  subjectType: approvalSubjectTypeEnum('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  reason: text('reason'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('approvals_organization_id_idx').on(table.organizationId),
  index('approvals_subject_idx').on(table.subjectType, table.subjectId),
  index('approvals_status_idx').on(table.status),
]);
