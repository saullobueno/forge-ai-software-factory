import { z } from 'zod';

/**
 * Status de uma tarefa (spec §7).
 */
export const taskStatusSchema = z.enum([
  'backlog',
  'ready',
  'planning',
  'in_progress',
  'review',
  'testing',
  'done',
  'blocked',
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * Ciclo de vida de uma execução de agente de IA (spec §9).
 */
export const agentRunStatusSchema = z.enum([
  'queued',
  'planning',
  'executing',
  'testing',
  'review',
  'approval_required',
  'completed',
  'failed',
  'cancelled',
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const agentStepStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export type AgentStepStatus = z.infer<typeof agentStepStatusSchema>;

/**
 * Papéis de agente disponíveis no orquestrador (spec §8).
 */
export const agentRoleSchema = z.enum([
  'planner',
  'code_explorer',
  'implementer',
  'test_engineer',
  'reviewer',
  'documentation_agent',
]);
export type AgentRole = z.infer<typeof agentRoleSchema>;

/**
 * Severidade de um finding de revisão de IA (spec §11).
 */
export const findingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const environmentKindSchema = z.enum(['development', 'preview', 'staging', 'production']);
export type EnvironmentKind = z.infer<typeof environmentKindSchema>;

/**
 * Resultado da avaliação de política para uma tool call (spec §8, §18).
 */
export const policyDecisionKindSchema = z.enum(['allow', 'deny', 'require_approval']);
export type PolicyDecisionKind = z.infer<typeof policyDecisionKindSchema>;

export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const testRunStatusSchema = z.enum(['queued', 'running', 'passed', 'failed', 'flaky']);
export type TestRunStatus = z.infer<typeof testRunStatusSchema>;

export const pullRequestStatusSchema = z.enum(['draft', 'open', 'merged', 'closed']);
export type PullRequestStatus = z.infer<typeof pullRequestStatusSchema>;

export const deploymentStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'rolled_back',
]);
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;

/**
 * Ferramentas tipadas que um agente pode invocar (spec §8). Mantido como union
 * fechada — novas ferramentas exigem avaliação explícita de política.
 */
export const agentToolNameSchema = z.enum([
  'list_files',
  'read_file',
  'search_code',
  'inspect_git',
  'get_issue',
  'get_project_rules',
  'write_file',
  'apply_patch',
  'run_command',
  'run_tests',
  'inspect_diff',
  'create_branch',
  'create_commit',
  'create_pull_request',
]);
export type AgentToolName = z.infer<typeof agentToolNameSchema>;

export const memberRoleSchema = z.enum([
  'admin',
  'platform_engineer',
  'tech_lead',
  'developer',
  'qa_engineer',
  'product_manager',
]);
export type MemberRole = z.infer<typeof memberRoleSchema>;
