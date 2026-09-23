import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { memberRoleSchema } from '../enums.ts';

export const organizationSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug deve ser kebab-case'),
  ...timestampsSchema.shape,
});
export type Organization = z.infer<typeof organizationSchema>;

/**
 * Identidade de usuário. Em Fase 2 (Auth/RBAC) isto ganha credenciais,
 * sessões e vínculo com múltiplas organizações — por ora, um usuário
 * pertence a exatamente uma organização (modelo simplificado da Fase 1).
 */
export const userSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  email: z.string().email(),
  name: z.string().min(1).max(200),
  avatarUrl: z.string().url().nullable(),
  role: memberRoleSchema,
  ...timestampsSchema.shape,
});
export type User = z.infer<typeof userSchema>;

export const teamSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  ...timestampsSchema.shape,
});
export type Team = z.infer<typeof teamSchema>;

/**
 * Join de User <-> Team. Não está na lista oficial de entidades da spec
 * §16, mas é estruturalmente necessário para que Team tenha membros.
 */
export const teamMemberSchema = z.object({
  id: idSchema,
  teamId: idSchema,
  userId: idSchema,
  ...timestampsSchema.shape,
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

const permissionSchema = z.string().min(1).max(100);

/**
 * Função customizável dentro de uma organização (spec §3 "Funções"). A
 * atribuição granular de Role a usuários é fundação para a Fase 2
 * (Auth/RBAC) — por ora `User.role` usa o enum de sistema (memberRole).
 */
export const roleSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  permissions: z.array(permissionSchema).default([]),
  isSystem: z.boolean().default(false),
  ...timestampsSchema.shape,
});
export type Role = z.infer<typeof roleSchema>;
