import { Injectable, NotFoundException } from '@nestjs/common';
import type { AgentView, UpdateAgentRequest } from '@forge/types';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { AgentsRepository, type AgentRow } from './agents.repository.js';

function toView(row: AgentRow): AgentView {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    allowedTools: row.allowedTools as AgentView['allowedTools'],
    isEnabled: row.isEnabled,
  };
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list(organizationId: string): Promise<AgentView[]> {
    return (await this.agentsRepository.listByOrganization(organizationId)).map(toView);
  }

  async update(id: string, organizationId: string, actorUserId: string, input: UpdateAgentRequest): Promise<AgentView> {
    const updated = await this.agentsRepository.update(id, organizationId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.allowedTools !== undefined ? { allowedTools: [...new Set(input.allowedTools)] } : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
    });
    if (!updated) throw new NotFoundException('Agente não encontrado.');

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'agent.updated',
      targetType: 'agent',
      targetId: id,
      metadata: { role: updated.role, changedFields: Object.keys(input) },
    });
    return toView(updated);
  }
}
