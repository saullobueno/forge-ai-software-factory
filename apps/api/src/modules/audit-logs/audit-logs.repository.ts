import { Injectable } from '@nestjs/common';
import { desc, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AuditLogRow = typeof schema.auditLogs.$inferSelect;
export type NewAuditLog = typeof schema.auditLogs.$inferInsert;

export type AuditLogWithActor = AuditLogRow & {
  actorUser: { id: string; name: string; email: string; role: string } | null;
};

@Injectable()
export class AuditLogsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listByOrganization(organizationId: string): Promise<AuditLogWithActor[]> {
    return this.database.db.query.auditLogs.findMany({
      where: eq(schema.auditLogs.organizationId, organizationId),
      orderBy: [desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id)],
      limit: 50,
      with: {
        actorUser: {
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async create(input: NewAuditLog): Promise<AuditLogRow> {
    const [created] = await this.database.db.insert(schema.auditLogs).values(input).returning();
    if (!created) throw new Error('Audit log não foi criado.');
    return created;
  }
}
