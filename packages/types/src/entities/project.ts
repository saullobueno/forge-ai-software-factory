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

/**
 * Corpo de `PATCH /projects/:id`. Campos ausentes não mudam; `null` limpa um
 * campo opcional. O `slug` nunca muda (é estável para URLs/referências).
 */
export const aiProviderNameSchema = z.enum(['mock', 'groq', 'gemini', 'anthropic']);
export type AiProviderName = z.infer<typeof aiProviderNameSchema>;

export const updateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).nullable(),
    languages: z.array(z.string().trim().min(1).max(50)).max(20),
    frameworks: z.array(z.string().trim().min(1).max(50)).max(20),
    packageManager: z.string().trim().min(1).max(50).nullable(),
    architectureNotes: z.string().trim().max(10_000).nullable(),
    codeRules: z.string().trim().max(10_000).nullable(),
    /** `null` volta ao provedor padrão do servidor. */
    aiProvider: aiProviderNameSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo para atualizar.' });
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

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
