import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { PolicyRule } from '@forge/types';
import { agentToolNameEnum, policyDecisionKindEnum } from './enums.ts';
import { organizations } from './organizations.ts';
import { toolCalls } from './agents.ts';

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  rules: jsonb('rules').notNull().$type<PolicyRule[]>().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('policies_organization_id_idx').on(table.organizationId)]);

export const policyDecisions = pgTable('policy_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id').references(() => policies.id, { onDelete: 'set null' }),
  toolCallId: uuid('tool_call_id')
    .notNull()
    .references(() => toolCalls.id, { onDelete: 'cascade' }),
  toolName: agentToolNameEnum('tool_name').notNull(),
  decision: policyDecisionKindEnum('decision').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('policy_decisions_organization_id_idx').on(table.organizationId),
  index('policy_decisions_tool_call_id_idx').on(table.toolCallId),
]);
