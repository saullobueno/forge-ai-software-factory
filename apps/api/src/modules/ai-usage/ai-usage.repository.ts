import { Injectable } from '@nestjs/common';
import { desc, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AiUsageRow = typeof schema.aiUsages.$inferSelect;

@Injectable()
export class AiUsageRepository {
  constructor(private readonly database: DatabaseService) {}

  async listRecentByOrganization(organizationId: string, limit = 500): Promise<AiUsageRow[]> {
    return this.database.db.query.aiUsages.findMany({
      where: eq(schema.aiUsages.organizationId, organizationId),
      orderBy: [desc(schema.aiUsages.createdAt), desc(schema.aiUsages.id)],
      limit,
    });
  }
}
