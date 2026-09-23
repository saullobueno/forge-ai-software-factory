import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { notificationKindEnum } from './enums';
import { organizations, users } from './organizations';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: notificationKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  isRead: boolean('is_read').notNull().default(false),
  relatedEntityType: text('related_entity_type'),
  relatedEntityId: uuid('related_entity_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('notifications_organization_id_idx').on(table.organizationId),
  index('notifications_user_id_idx').on(table.userId),
  index('notifications_is_read_idx').on(table.isRead),
]);
