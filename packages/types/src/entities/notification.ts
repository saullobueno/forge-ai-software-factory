import { z } from 'zod';
import { idSchema, timestampsSchema } from '../common.ts';
import { notificationKindSchema } from '../enums.ts';

export const notificationSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  userId: idSchema,
  kind: notificationKindSchema,
  title: z.string().min(1).max(300),
  body: z.string().max(4000).nullable(),
  isRead: z.boolean().default(false),
  relatedEntityType: z.string().max(100).nullable(),
  relatedEntityId: idSchema.nullable(),
  ...timestampsSchema.shape,
});
export type Notification = z.infer<typeof notificationSchema>;
