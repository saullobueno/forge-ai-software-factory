import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { knowledgeSourceKindSchema } from '../enums.ts';

export const knowledgeSourceSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  projectId: idSchema.nullable(),
  workspaceId: idSchema.nullable(),
  kind: knowledgeSourceKindSchema,
  title: z.string().min(1).max(300),
  uri: z.string().min(1).max(1000),
  version: z.string().max(100).nullable(),
  ...timestampsSchema.shape,
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

/**
 * Conteúdo recuperado via KnowledgeChunk é não confiável (spec §14) e nunca
 * pode sobrescrever políticas de sistema/segurança — a aplicação deve
 * sempre tratar `content` como dado, nunca como instrução.
 */
export const knowledgeChunkSchema = z.object({
  id: idSchema,
  knowledgeSourceId: idSchema,
  content: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative().nullable(),
  ...timestampsSchema.shape,
});
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;
