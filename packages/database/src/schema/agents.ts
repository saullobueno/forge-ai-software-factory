import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  agentRoleEnum,
  agentRunStatusEnum,
  agentStepStatusEnum,
  agentToolNameEnum,
  toolCallStatusEnum,
} from './enums.ts';
import { organizations, users } from './organizations.ts';
import { tasks } from './tasks.ts';
import { workspaces } from './workspaces.ts';

/**
 * Configuração de um agente para um papel (spec §8): ferramentas
 * permitidas e permissões de menor privilégio.
 */
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  role: agentRoleEnum('role').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  /** Instruções extras do agente, anexadas ao prompt (dado da organização; nunca sobrepõe políticas). */
  instructions: text('instructions'),
  allowedTools: jsonb('allowed_tools').notNull().$type<string[]>().default([]),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('agents_organization_id_idx').on(table.organizationId)]);

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'restrict' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  status: agentRunStatusEnum('status').notNull().default('queued'),
  objective: text('objective').notNull(),
  scope: jsonb('scope').notNull().$type<Record<string, unknown>>().default({}),
  /**
   * Usuário que chamou `POST /tasks/:id/agent-runs` (Fase 13 continuação
   * #7 — limites diários por USUÁRIO, além do já existente por
   * organização). Nullable/`onDelete: 'set null'`, mesmo padrão de
   * `approvals.requestedByUserId`/`approvedByUserId`: nunca bloqueia a
   * exclusão de um usuário, e dados legados/seedados diretamente no banco
   * (sem passar pelo endpoint real) simplesmente não têm este dado —
   * degrada graciosamente (a execução some do cálculo de limite por
   * usuário, nunca quebra). É a única forma direta e eficiente de
   * `ai_usages` (que não guarda usuário nenhum, só `organizationId`) ser
   * filtrável por usuário: um JOIN em `agent_runs.requested_by_user_id`,
   * já indexado abaixo, em vez de uma consulta reativa ao audit log
   * `agent_run.triggered` a cada avaliação de limite.
   */
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  totalTokens: integer('total_tokens').notNull().default(0),
  totalCostUsd: numeric('total_cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_runs_organization_id_idx').on(table.organizationId),
  index('agent_runs_task_id_idx').on(table.taskId),
  index('agent_runs_status_idx').on(table.status),
  index('agent_runs_requested_by_user_id_idx').on(table.requestedByUserId),
]);

export const agentSteps = pgTable('agent_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentRunId: uuid('agent_run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: agentRoleEnum('role').notNull(),
  status: agentStepStatusEnum('status').notNull().default('pending'),
  input: jsonb('input').notNull().$type<Record<string, unknown>>().default({}),
  output: jsonb('output').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  tokens: integer('tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_steps_agent_run_id_idx').on(table.agentRunId),
  index('agent_steps_status_idx').on(table.status),
]);

/**
 * Chamada de ferramenta tipada por um agente (spec §8, §20). `arguments` e
 * `result` podem conter dados sensíveis — redaction é responsabilidade da
 * camada de aplicação antes de persistir/exibir, não deste schema.
 */
export const toolCalls = pgTable('tool_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentStepId: uuid('agent_step_id')
    .notNull()
    .references(() => agentSteps.id, { onDelete: 'cascade' }),
  toolName: agentToolNameEnum('tool_name').notNull(),
  arguments: jsonb('arguments').notNull().$type<Record<string, unknown>>().default({}),
  result: jsonb('result').$type<Record<string, unknown>>(),
  status: toolCallStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('tool_calls_agent_step_id_idx').on(table.agentStepId),
  index('tool_calls_tool_name_idx').on(table.toolName),
]);
