import { Injectable } from '@nestjs/common';
import { AuditLogsRepository, type AuditLogRow, type AuditLogWithActor } from './audit-logs.repository.js';

export interface RecordAuditLogInput {
  organizationId: string;
  actorType: 'user' | 'agent' | 'system';
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  async listByOrganization(organizationId: string): Promise<AuditLogWithActor[]> {
    return this.auditLogsRepository.listByOrganization(organizationId);
  }

  async record(input: RecordAuditLogInput): Promise<AuditLogRow> {
    return this.auditLogsRepository.create({
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });
  }
}
