import { Injectable } from '@nestjs/common';
import { and, eq, schema } from '@forge/database';
import type { PolicyRule } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

/** Nome da política única, por organização, que guarda os ajustes de ferramentas. */
export const TOOL_OVERRIDES_POLICY_NAME = 'tool-overrides';

@Injectable()
export class PoliciesRepository {
  constructor(private readonly database: DatabaseService) {}

  private findRow(organizationId: string) {
    return this.database.db.query.policies.findFirst({
      where: and(eq(schema.policies.organizationId, organizationId), eq(schema.policies.name, TOOL_OVERRIDES_POLICY_NAME)),
    });
  }

  async getToolOverrideRules(organizationId: string): Promise<PolicyRule[]> {
    const row = await this.findRow(organizationId);
    return row?.isActive ? row.rules : [];
  }

  async saveToolOverrideRules(organizationId: string, rules: PolicyRule[]): Promise<void> {
    const existing = await this.findRow(organizationId);
    if (existing) {
      await this.database.db
        .update(schema.policies)
        .set({ rules, isActive: true, updatedAt: new Date() })
        .where(and(eq(schema.policies.id, existing.id), eq(schema.policies.organizationId, organizationId)));
      return;
    }
    await this.database.db.insert(schema.policies).values({
      organizationId,
      name: TOOL_OVERRIDES_POLICY_NAME,
      description: 'Ajustes da organização que tornam ferramentas dos agentes mais restritivas.',
      rules,
    });
  }
}
