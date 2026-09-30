import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, schema } from '@forge/database';
import type { NotificationKind } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type NotificationRow = typeof schema.notifications.$inferSelect;

export interface NewNotification {
  organizationId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  relatedEntityType: 'task' | 'agent_run';
  relatedEntityId: string;
}

export interface RunContext {
  organizationId: string;
  requestedByUserId: string | null;
  taskId: string;
  taskTitle: string;
  projectId: string;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async insertMany(rows: NewNotification[]): Promise<void> {
    if (rows.length === 0) return;
    await this.database.db.insert(schema.notifications).values(rows);
  }

  async listForUser(organizationId: string, userId: string, limit: number): Promise<NotificationRow[]> {
    return this.database.db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.organizationId, organizationId), eq(schema.notifications.userId, userId)))
      .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
      .limit(limit);
  }

  async countUnread(organizationId: string, userId: string): Promise<number> {
    const rows = await this.database.db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.organizationId, organizationId),
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.isRead, false),
        ),
      );
    return rows.length;
  }

  async markRead(id: string, organizationId: string, userId: string): Promise<boolean> {
    const updated = await this.database.db
      .update(schema.notifications)
      .set({ isRead: true, updatedAt: new Date() })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.organizationId, organizationId),
          eq(schema.notifications.userId, userId),
        ),
      )
      .returning();
    return updated.length > 0;
  }

  async markAllRead(organizationId: string, userId: string): Promise<void> {
    await this.database.db
      .update(schema.notifications)
      .set({ isRead: true, updatedAt: new Date() })
      .where(
        and(
          eq(schema.notifications.organizationId, organizationId),
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.isRead, false),
        ),
      );
  }

  async findRunContext(agentRunId: string): Promise<RunContext | undefined> {
    const [row] = await this.database.db
      .select({
        organizationId: schema.agentRuns.organizationId,
        requestedByUserId: schema.agentRuns.requestedByUserId,
        taskId: schema.tasks.id,
        taskTitle: schema.tasks.title,
        projectId: schema.tasks.projectId,
      })
      .from(schema.agentRuns)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.agentRuns.taskId))
      .where(eq(schema.agentRuns.id, agentRunId));
    return row;
  }

  async findOrganizationMembers(organizationId: string): Promise<{ id: string; role: (typeof schema.users.$inferSelect)['role'] }[]> {
    return this.database.db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.organizationId, organizationId));
  }

  async findProjectName(projectId: string): Promise<string | undefined> {
    const [row] = await this.database.db.select({ name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.id, projectId));
    return row?.name;
  }

  async taskProjects(taskIds: string[]): Promise<Map<string, string>> {
    if (taskIds.length === 0) return new Map();
    const rows = await this.database.db
      .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, taskIds));
    return new Map(rows.map((row) => [row.id, row.projectId]));
  }

  async runLocations(runIds: string[]): Promise<Map<string, { taskId: string; projectId: string }>> {
    if (runIds.length === 0) return new Map();
    const rows = await this.database.db
      .select({ id: schema.agentRuns.id, taskId: schema.tasks.id, projectId: schema.tasks.projectId })
      .from(schema.agentRuns)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.agentRuns.taskId))
      .where(inArray(schema.agentRuns.id, runIds));
    return new Map(rows.map((row) => [row.id, { taskId: row.taskId, projectId: row.projectId }]));
  }
}
