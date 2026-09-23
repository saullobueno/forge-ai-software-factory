import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { aiMessageRoleSchema } from '../enums.ts';

export const aiMessageSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  agentStepId: idSchema.nullable(),
  toolCallId: idSchema.nullable(),
  role: aiMessageRoleSchema,
  content: z.string(),
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  ...timestampsSchema.shape,
});
export type AIMessage = z.infer<typeof aiMessageSchema>;

export const aiUsageSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    agentRunId: idSchema.nullable(),
    agentStepId: idSchema.nullable(),
    aiMessageId: idSchema.nullable(),
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(200),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    ...timestampsSchema.shape,
  })
  .refine((usage) => usage.totalTokens === usage.promptTokens + usage.completionTokens, {
    message: 'totalTokens deve ser igual a promptTokens + completionTokens',
    path: ['totalTokens'],
  });
export type AIUsage = z.infer<typeof aiUsageSchema>;
