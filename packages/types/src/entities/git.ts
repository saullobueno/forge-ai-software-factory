import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import {
  fileChangeTypeSchema,
  pullRequestStatusSchema,
  repositoryProviderSchema,
} from '../enums.ts';

export const fileSnapshotSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  workspaceId: idSchema,
  path: z.string().min(1).max(1000),
  contentHash: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative(),
  capturedAt: z.coerce.date(),
  ...timestampsSchema.shape,
});
export type FileSnapshot = z.infer<typeof fileSnapshotSchema>;

export const codeChangeSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  workspaceId: idSchema,
  agentRunId: idSchema.nullable(),
  filePath: z.string().min(1).max(1000),
  changeType: fileChangeTypeSchema,
  beforeSnapshotId: idSchema.nullable(),
  afterSnapshotId: idSchema.nullable(),
  ...timestampsSchema.shape,
});
export type CodeChange = z.infer<typeof codeChangeSchema>;

export const diffSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  codeChangeId: idSchema,
  patch: z.string(),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
  ...timestampsSchema.shape,
});
export type Diff = z.infer<typeof diffSchema>;

export const pullRequestSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    projectId: idSchema,
    repositoryId: idSchema,
    workspaceId: idSchema.nullable(),
    taskId: idSchema.nullable(),
    provider: repositoryProviderSchema,
    externalNumber: z.number().int().positive().nullable(),
    externalUrl: z.string().url().nullable(),
    title: z.string().min(1).max(300),
    description: z.string().max(10_000).nullable(),
    sourceBranch: z.string().min(1).max(300),
    targetBranch: z.string().min(1).max(300),
    status: pullRequestStatusSchema.default('draft'),
    mergedAt: z.coerce.date().nullable(),
    ...timestampsSchema.shape,
  })
  .refine((pr) => pr.status === 'merged' || pr.mergedAt === null, {
    message: 'mergedAt só pode ser definido quando status é "merged"',
    path: ['mergedAt'],
  })
  .refine((pr) => pr.status !== 'merged' || pr.mergedAt !== null, {
    message: 'status "merged" exige mergedAt definido',
    path: ['mergedAt'],
  });
export type PullRequest = z.infer<typeof pullRequestSchema>;
