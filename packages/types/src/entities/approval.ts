import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { approvalStatusSchema, approvalSubjectTypeSchema } from '../enums.ts';

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

/**
 * Corpo de `POST /agent-runs/:id/approve` e `POST /agent-runs/:id/reject`
 * (fluxo de aprovação humana sobre uma execução parada em
 * `approval_required` — spec §9/§18). `reason` é sempre opcional: uma
 * aprovação normalmente não precisa de justificativa, e mesmo uma rejeição
 * pode ser óbvia o suficiente para dispensar uma. `.default({})` no nível do
 * objeto (não só em `reason`) é necessário porque um cliente que não envia
 * corpo nenhum (sem `Content-Type: application/json`, ex.: `fetch(url, {
 * method: 'POST' })` sem `body`, ou `supertest.post(url)` sem `.send()`)
 * nunca faz o Express popular `req.body` — o valor que chega ao
 * `ZodValidationPipe` é `undefined`, não `{}`. Um `z.object({...})` comum
 * rejeita `undefined` na raiz (só teria `reason` opcional DENTRO de um
 * objeto que precisa existir); `.default({})` cobre esse caso.
 */
export const agentRunDecisionRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .default({});
export type AgentRunDecisionRequest = z.infer<typeof agentRunDecisionRequestSchema>;
