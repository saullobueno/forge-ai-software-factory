import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { repositoryProviderSchema, workspaceStatusSchema } from '../enums.ts';

export const techProfileSchema = z.object({
  languages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  packageManager: z.string().nullable().default(null),
});
export type TechProfile = z.infer<typeof techProfileSchema>;

export const projectSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100),
  description: z.string().max(4000).nullable(),
  techProfile: techProfileSchema,
  architectureNotes: z.string().nullable(),
  codeRules: z.string().nullable(),
  ...timestampsSchema.shape,
});
export type Project = z.infer<typeof projectSchema>;

/**
 * Corpo de `POST /projects`. `slug` e o repositório demo vinculado são
 * decididos pelo servidor, nunca informados pelo cliente.
 */
export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  languages: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  frameworks: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  packageManager: z.string().trim().min(1).max(50).optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const repositorySchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  provider: repositoryProviderSchema,
  owner: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  defaultBranch: z.string().min(1).max(200).default('main'),
  url: z.string().url().nullable(),
  ...timestampsSchema.shape,
});
export type Repository = z.infer<typeof repositorySchema>;

/**
 * Contexto de execução isolado (spec §6): branch/worktree, tarefa
 * selecionada, execução do agente, arquivos alterados, logs e artefatos.
 */
export const workspaceSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema,
  repositoryId: idSchema,
  taskId: idSchema.nullable(),
  branchName: z.string().min(1).max(300),
  worktreePath: z.string().min(1).max(1000).nullable(),
  status: workspaceStatusSchema.default('active'),
  ...timestampsSchema.shape,
});
export type Workspace = z.infer<typeof workspaceSchema>;
