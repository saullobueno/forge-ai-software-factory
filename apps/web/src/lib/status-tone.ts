import type { AgentRunStatus, TaskPriority, TaskStatus } from '@forge/types';

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
