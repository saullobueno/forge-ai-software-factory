import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AiUsageRow = typeof schema.aiUsages.$inferSelect;
export type AiUsageWithStep = AiUsageRow & {
  agentStep: { durationMs: number | null } | null;
};

@Injectable()
export class AiUsageRepository {
  constructor(private readonly database: DatabaseService) {}

  async listRecentByOrganization(organizationId: string, limit = 500): Promise<AiUsageWithStep[]> {
    return this.database.db.query.aiUsages.findMany({
      where: eq(schema.aiUsages.organizationId, organizationId),
      orderBy: [desc(schema.aiUsages.createdAt), desc(schema.aiUsages.id)],
      limit,
      with: {
        agentStep: {
          columns: {
            durationMs: true,
          },
        },
      },
    });
  }

  async listByOrganizationSince(organizationId: string, since: Date, limit = 5_000): Promise<AiUsageRow[]> {
    return this.database.db.query.aiUsages.findMany({
      where: and(eq(schema.aiUsages.organizationId, organizationId), gt(schema.aiUsages.createdAt, since)),
      orderBy: [desc(schema.aiUsages.createdAt), desc(schema.aiUsages.id)],
      limit,
    });
  }
}
