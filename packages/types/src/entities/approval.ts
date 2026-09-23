import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common';
import { approvalStatusSchema, approvalSubjectTypeSchema } from '../enums';

/**
 * Aprovação humana sobre uma entidade (referência polimórfica via
 * subjectType/subjectId — spec §13 ambientes protegidos, §18 ações
 * destrutivas). Sem FK de banco pois subjectId aponta para tabelas
 * distintas conforme subjectType.
 */
export const approvalSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    subjectType: approvalSubjectTypeSchema,
    subjectId: idSchema,
    status: approvalStatusSchema.default('pending'),
    requestedByUserId: idSchema.nullable(),
    approvedByUserId: idSchema.nullable(),
    reason: z.string().max(2000).nullable(),
    decidedAt: z.coerce.date().nullable(),
    ...timestampsSchema.shape,
  })
  .refine((approval) => approval.status !== 'pending' || approval.decidedAt === null, {
    message: 'Aprovações pendentes não podem ter decidedAt',
    path: ['decidedAt'],
  })
  .refine((approval) => approval.status === 'pending' || approval.decidedAt !== null, {
    message: 'Aprovações decididas exigem decidedAt',
    path: ['decidedAt'],
  })
  .refine((approval) => approval.status !== 'approved' || approval.approvedByUserId !== null, {
    message: 'Aprovações concedidas exigem approvedByUserId',
    path: ['approvedByUserId'],
  });
export type Approval = z.infer<typeof approvalSchema>;
