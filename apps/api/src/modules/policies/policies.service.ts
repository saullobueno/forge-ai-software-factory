import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { defaultToolDecision, isAtLeastAsStrict, type ToolPolicyOverrides } from '@forge/domain';
import { agentToolNameSchema, type AgentToolName, type PolicyDecisionKind, type ToolPolicyView } from '@forge/types';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { PoliciesRepository } from './policies.repository.js';

@Injectable()
export class PoliciesService {
  constructor(
    private readonly policiesRepository: PoliciesRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /** Ajustes efetivos da organização (já filtrados: nunca mais frouxos que o padrão). */
  async getOverrides(organizationId: string): Promise<ToolPolicyOverrides> {
    const rules = await this.policiesRepository.getToolOverrideRules(organizationId);
    const overrides: ToolPolicyOverrides = {};
    for (const rule of rules) {
      if (isAtLeastAsStrict(rule.decision, defaultToolDecision(rule.toolName))) overrides[rule.toolName] = rule.decision;
    }
    return overrides;
  }

  async listTools(organizationId: string): Promise<ToolPolicyView[]> {
    const overrides = await this.getOverrides(organizationId);
    return agentToolNameSchema.options.map((toolName) => {
      const defaultDecision = defaultToolDecision(toolName);
      return { toolName, defaultDecision, decision: overrides[toolName] ?? defaultDecision };
    });
  }

  async setToolDecision(
    organizationId: string,
    actorUserId: string,
    toolName: AgentToolName,
    decision: PolicyDecisionKind,
  ): Promise<ToolPolicyView[]> {
    const defaultDecision = defaultToolDecision(toolName);
    if (!isAtLeastAsStrict(decision, defaultDecision)) {
      throw new UnprocessableEntityException(
        `A política padrão de "${toolName}" não pode ser afrouxada: só é possível torná-la igual ou mais restritiva.`,
      );
    }

    const overrides = await this.getOverrides(organizationId);
    if (decision === defaultDecision) delete overrides[toolName];
    else overrides[toolName] = decision;

    const rules = (Object.entries(overrides) as [AgentToolName, PolicyDecisionKind][]).map(([name, value]) => ({
      toolName: name,
      decision: value,
      condition: null,
    }));
    await this.policiesRepository.saveToolOverrideRules(organizationId, rules);

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'policy.tool_updated',
      targetType: 'policy',
      metadata: { toolName, decision, defaultDecision },
    });
    return this.listTools(organizationId);
  }
}
