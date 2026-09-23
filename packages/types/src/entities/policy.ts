import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { agentToolNameSchema, policyDecisionKindSchema } from '../enums.ts';

export const policyRuleSchema = z.object({
  toolName: agentToolNameSchema,
  decision: policyDecisionKindSchema,
  condition: z.string().max(500).nullable().default(null),
});
export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const policySchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  rules: z.array(policyRuleSchema).default([]),
  isActive: z.boolean().default(true),
  ...timestampsSchema.shape,
});
export type Policy = z.infer<typeof policySchema>;

export const policyDecisionSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  policyId: idSchema.nullable(),
  toolCallId: idSchema,
  toolName: agentToolNameSchema,
  decision: policyDecisionKindSchema,
  reason: z.string().max(2000).nullable(),
  ...timestampsSchema.shape,
});
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;
