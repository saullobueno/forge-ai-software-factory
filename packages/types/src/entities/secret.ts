import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common';
import { secretProviderSchema } from '../enums';

/**
 * Aponta apenas para a localização de um secret em um provedor externo.
 * O schema é `.strict()` deliberadamente: qualquer campo desconhecido (ex.:
 * um valor de secret cru) faz o parse falhar — nunca deve ser possível
 * transportar um valor de secret através deste tipo (spec §18: "secrets
 * são referenciados, nunca injetados no contexto do modelo por padrão").
 */
export const secretReferenceSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    projectId: idSchema.nullable(),
    environmentId: idSchema.nullable(),
    name: z.string().min(1).max(200),
    provider: secretProviderSchema,
    externalRef: z.string().min(1).max(1000),
    ...timestampsSchema.shape,
  })
  .strict();
export type SecretReference = z.infer<typeof secretReferenceSchema>;
