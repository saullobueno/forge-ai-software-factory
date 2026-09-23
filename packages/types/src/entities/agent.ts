import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common';
import {
  agentRoleSchema,
  agentRunStatusSchema,
  agentStepStatusSchema,
  agentToolNameSchema,
  toolCallStatusSchema,
} from '../enums';

/**
 * Configuração de um agente para um papel (spec §8): ferramentas
 * permitidas e permissões de menor privilégio.
 */
export const agentSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  role: agentRoleSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  allowedTools: z.array(agentToolNameSchema).default([]),
  isEnabled: z.boolean().default(true),
  ...timestampsSchema.shape,
});
export type Agent = z.infer<typeof agentSchema>;

const terminalAgentRunStatuses: ReadonlySet<z.infer<typeof agentRunStatusSchema>> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export const agentRunSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    taskId: idSchema,
    agentId: idSchema,
    workspaceId: idSchema.nullable(),
    status: agentRunStatusSchema.default('queued'),
    objective: z.string().min(1).max(4000),
    scope: z.record(z.string(), z.unknown()).default({}),
    startedAt: z.coerce.date().nullable(),
    completedAt: z.coerce.date().nullable(),
    totalTokens: z.number().int().nonnegative().default(0),
    totalCostUsd: z.number().nonnegative().default(0),
    ...timestampsSchema.shape,
  })
  .refine(
    (run) => !terminalAgentRunStatuses.has(run.status) || run.completedAt !== null,
    { message: 'Execuções em estado terminal exigem completedAt', path: ['completedAt'] },
  );
export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentStepSchema = z
  .object({
    id: idSchema,
    agentRunId: idSchema,
    name: z.string().min(1).max(200),
    role: agentRoleSchema,
    status: agentStepStatusSchema.default('pending'),
    input: z.record(z.string(), z.unknown()).default({}),
    output: z.record(z.string(), z.unknown()).nullable(),
    startedAt: z.coerce.date().nullable(),
    completedAt: z.coerce.date().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    tokens: z.number().int().nonnegative().default(0),
    costUsd: z.number().nonnegative().default(0),
    ...timestampsSchema.shape,
  })
  .refine(
    (step) =>
      step.startedAt === null ||
      step.completedAt === null ||
      step.completedAt.getTime() >= step.startedAt.getTime(),
    { message: 'completedAt não pode ser anterior a startedAt', path: ['completedAt'] },
  );
export type AgentStep = z.infer<typeof agentStepSchema>;

/**
 * Chamada de ferramenta tipada por um agente (spec §8, §20). `arguments` e
 * `result` são conteúdo potencialmente sensível — redaction é aplicada na
 * camada de aplicação antes de persistir/exibir, não neste schema.
 */
export const toolCallSchema = z.object({
  id: idSchema,
  agentStepId: idSchema,
  toolName: agentToolNameSchema,
  arguments: z.record(z.string(), z.unknown()).default({}),
  result: z.record(z.string(), z.unknown()).nullable(),
  status: toolCallStatusSchema.default('pending'),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  ...timestampsSchema.shape,
});
export type ToolCall = z.infer<typeof toolCallSchema>;
