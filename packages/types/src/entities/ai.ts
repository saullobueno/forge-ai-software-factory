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

export const aiPlaygroundModelIdSchema = z.enum([
  'forge-mock-fast',
  'forge-mock-balanced',
  'forge-mock-reviewer',
]);
export type AIPlaygroundModelId = z.infer<typeof aiPlaygroundModelIdSchema>;

export const aiPlaygroundDatasetItemSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().min(1).max(120),
  input: z.string().min(1).max(2_000),
  expectedKeywords: z.array(z.string().min(2).max(80)).max(12).default([]),
});
export type AIPlaygroundDatasetItem = z.infer<typeof aiPlaygroundDatasetItemSchema>;

export const aiPlaygroundEvaluationRequestSchema = z.object({
  prompt: z.string().min(1).max(4_000),
  models: z.array(aiPlaygroundModelIdSchema).min(1).max(3).default(['forge-mock-fast', 'forge-mock-balanced']),
  dataset: z.array(aiPlaygroundDatasetItemSchema).min(1).max(5),
  requireStructuredOutput: z.boolean().default(true),
});
export type AIPlaygroundEvaluationRequest = z.infer<typeof aiPlaygroundEvaluationRequestSchema>;

export interface AIPlaygroundModel {
  id: AIPlaygroundModelId;
  provider: 'mock';
  name: string;
  description: string;
  inputCostPerMillionTokensUsd: number;
  outputCostPerMillionTokensUsd: number;
}

export interface AIPlaygroundEvaluationCaseResult {
  datasetItemId: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd: number;
  structuredOutputValid: boolean;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
}

export interface AIPlaygroundEvaluationModelResult {
  model: AIPlaygroundModel;
  cases: AIPlaygroundEvaluationCaseResult[];
  averageScore: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  structuredValidityRate: number;
}

export interface AIPlaygroundEvaluationResponse {
  results: AIPlaygroundEvaluationModelResult[];
  winner: AIPlaygroundModelId;
}
