import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Tabela mínima usada para validar migrações e conectividade em Fase 0.
 * As entidades de domínio completas (spec §16) são adicionadas na Fase 1.
 */
export const healthChecks = pgTable('health_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  note: text('note').notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});
