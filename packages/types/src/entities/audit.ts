import { z } from 'zod';
import { idSchema } from '../common.ts';
import { actorTypeSchema } from '../enums.ts';

/**
 * Registro de auditoria imutável (spec §20) — só `createdAt`, sem
 * `updatedAt`, pois um AuditLog nunca é alterado após criado.
 */
export const auditLogSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  actorType: actorTypeSchema,
  actorUserId: idSchema.nullable(),
  action: z.string().min(1).max(200),
  targetType: z.string().min(1).max(100),
  targetId: idSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.coerce.date(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;
