import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common';
import { testArtifactKindSchema, testRunStatusSchema } from '../enums';

export const testRunSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  workspaceId: idSchema.nullable(),
  agentRunId: idSchema.nullable(),
  triggeredByUserId: idSchema.nullable(),
  status: testRunStatusSchema.default('queued'),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  ...timestampsSchema.shape,
});
export type TestRun = z.infer<typeof testRunSchema>;

export const testSuiteSchema = z.object({
  id: idSchema,
  testRunId: idSchema,
  name: z.string().min(1).max(300),
  status: testRunStatusSchema.default('queued'),
  passedCount: z.number().int().nonnegative().default(0),
  failedCount: z.number().int().nonnegative().default(0),
  skippedCount: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().nullable(),
  isFlaky: z.boolean().default(false),
  ...timestampsSchema.shape,
});
export type TestSuite = z.infer<typeof testSuiteSchema>;

export const testArtifactSchema = z.object({
  id: idSchema,
  testRunId: idSchema,
  testSuiteId: idSchema.nullable(),
  kind: testArtifactKindSchema,
  name: z.string().min(1).max(300),
  storageKey: z.string().min(1).max(1000),
  sizeBytes: z.number().int().nonnegative().nullable(),
  ...timestampsSchema.shape,
});
export type TestArtifact = z.infer<typeof testArtifactSchema>;
