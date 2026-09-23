import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { secretProviderEnum } from './enums';
import { organizations } from './organizations';
import { projects } from './projects';
import { environments } from './environments';

/**
 * Aponta apenas para a localização de um secret em um provedor externo —
 * o valor em si nunca é armazenado aqui nem exposto a um agente (spec
 * §18: "secrets são referenciados, nunca injetados no contexto do modelo
 * por padrão").
 */
export const secretReferences = pgTable('secret_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  environmentId: uuid('environment_id').references(() => environments.id, {
    onDelete: 'cascade',
  }),
  name: text('name').notNull(),
  provider: secretProviderEnum('provider').notNull(),
  externalRef: text('external_ref').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('secret_references_organization_id_idx').on(table.organizationId),
  index('secret_references_environment_id_idx').on(table.environmentId),
]);
