import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common';
import { repositoryProviderSchema, workspaceStatusSchema } from '../enums';

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
