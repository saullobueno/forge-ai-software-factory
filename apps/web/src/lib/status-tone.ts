import type {
  AgentRunStatus,
  AgentStepStatus,
  DeploymentStatus,
  FindingSeverity,
  TaskPriority,
  TaskStatus,
  ToolCallStatus,
} from '@forge/types';

type Tone = 'neutral' | 'positive' | 'attention' | 'critical';

export function taskStatusTone(status: TaskStatus): Tone {
  switch (status) {
    case 'done':
      return 'positive';
    case 'blocked':
      return 'critical';
    case 'review':
    case 'testing':
      return 'attention';
    default:
      return 'neutral';
  }
}

export function taskPriorityTone(priority: TaskPriority): Tone {
  switch (priority) {
    case 'urgent':
      return 'critical';
    case 'high':
      return 'attention';
    default:
      return 'neutral';
  }
}

export function agentRunStatusTone(status: AgentRunStatus): Tone {
  switch (status) {
    case 'completed':
      return 'positive';
    case 'failed':
    case 'cancelled':
      return 'critical';
    case 'approval_required':
    case 'review':
      return 'attention';
    default:
      return 'neutral';
  }
}

export function agentStepStatusTone(status: AgentStepStatus): Tone {
  switch (status) {
    case 'succeeded':
      return 'positive';
    case 'failed':
      return 'critical';
    case 'running':
      return 'attention';
    default:
      return 'neutral';
  }
}

export function toolCallStatusTone(status: ToolCallStatus): Tone {
  switch (status) {
    case 'succeeded':
      return 'positive';
    case 'failed':
    case 'rejected':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function findingSeverityTone(severity: FindingSeverity): Tone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'critical';
    case 'medium':
      return 'attention';
    default:
      return 'neutral';
  }
}

export function deploymentStatusTone(status: DeploymentStatus): Tone {
  switch (status) {
    case 'succeeded':
      return 'positive';
    case 'failed':
    case 'rolled_back':
      return 'critical';
    case 'queued':
    case 'running':
      return 'attention';
  }
}
