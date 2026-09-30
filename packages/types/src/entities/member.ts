import { z } from 'zod';
import { idSchema } from '../common.ts';
import { memberRoleSchema } from '../enums.ts';

/** Membro da organização na tela de Configurações → Usuários. */
export const memberViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  /** Conta de demonstração: não pode ser removida nem ter o papel alterado. */
  isProtected: z.boolean(),
});
export type MemberView = z.infer<typeof memberViewSchema>;

export const updateMemberRoleRequestSchema = z.object({ role: memberRoleSchema });
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

export const invitationStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const invitationViewSchema = z.object({
  id: idSchema,
  email: z.string(),
  role: memberRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type InvitationView = z.infer<typeof invitationViewSchema>;

export const createInvitationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: memberRoleSchema,
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/** O `token` só é devolvido na criação: não há como recuperá-lo depois. */
export const createdInvitationSchema = invitationViewSchema.extend({ token: z.string() });
export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;

export const invitationLookupSchema = z.object({
  email: z.string(),
  role: memberRoleSchema,
  organizationName: z.string(),
});
export type InvitationLookup = z.infer<typeof invitationLookupSchema>;

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
