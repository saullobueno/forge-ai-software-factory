import { Injectable } from '@nestjs/common';
import type { AgentRunGovernanceSink, AgentRunPolicyDecisionEvent } from '@forge/agents';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';

@Injectable()
export class AgentRunGovernanceAuditService implements AgentRunGovernanceSink {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  async recordPolicyDecision(event: AgentRunPolicyDecisionEvent): Promise<void> {
    await this.auditLogsService.record({
      organizationId: event.organizationId,
      actorType: 'user',
      actorUserId: event.actorUserId ?? null,
      action:
        event.decision === 'require_approval'
          ? 'agent_run.policy_approval_required'
          : 'agent_run.policy_denied',
      targetType: 'tool_call',
      targetId: event.toolCallId,
      metadata: {
        agentRunId: event.agentRunId,
        stepId: event.stepId,
        role: event.role,
        toolName: event.toolName,
        decision: event.decision,
        reason: event.reason,
      },
    });
  }
}
