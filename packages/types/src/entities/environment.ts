import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { deploymentStatusSchema, environmentKindSchema } from '../enums.ts';

export const environmentSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  kind: environmentKindSchema,
  name: z.string().min(1).max(200),
  url: z.string().url().nullable(),
  isProtected: z.boolean().default(false),
  ...timestampsSchema.shape,
});
export type Environment = z.infer<typeof environmentSchema>;

const terminalDeploymentStatuses: ReadonlySet<z.infer<typeof deploymentStatusSchema>> = new Set([
  'succeeded',
  'failed',
  'rolled_back',
]);

export const deploymentSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    environmentId: idSchema,
    projectId: idSchema,
    pullRequestId: idSchema.nullable(),
    commitSha: z.string().min(7).max(64),
    status: deploymentStatusSchema.default('queued'),
    startedAt: z.coerce.date().nullable(),
    completedAt: z.coerce.date().nullable(),
    deployedByUserId: idSchema.nullable(),
    ...timestampsSchema.shape,
  })
  .refine(
    (deployment) => !terminalDeploymentStatuses.has(deployment.status) || deployment.completedAt !== null,
    { message: 'Deployments em estado terminal exigem completedAt', path: ['completedAt'] },
  );
export type Deployment = z.infer<typeof deploymentSchema>;
