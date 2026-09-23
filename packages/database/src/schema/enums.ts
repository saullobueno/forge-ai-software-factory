import { pgEnum } from 'drizzle-orm/pg-core';
import {
  actorTypeSchema,
  agentRoleSchema,
  agentRunStatusSchema,
  agentStepStatusSchema,
  agentToolNameSchema,
  aiMessageRoleSchema,
  approvalStatusSchema,
  approvalSubjectTypeSchema,
  deploymentStatusSchema,
  environmentKindSchema,
  fileChangeTypeSchema,
  knowledgeSourceKindSchema,
  memberRoleSchema,
  notificationKindSchema,
  policyDecisionKindSchema,
  pullRequestStatusSchema,
  repositoryProviderSchema,
  secretProviderSchema,
  taskPrioritySchema,
  taskStatusSchema,
  testArtifactKindSchema,
  testRunStatusSchema,
  toolCallStatusSchema,
  workspaceStatusSchema,
} from '@forge/types';

/**
 * Todos os pgEnum abaixo são derivados diretamente dos schemas zod de
 * @forge/types — única fonte de verdade compartilhada entre validação de
 * aplicação e schema de banco (spec §16/§17).
 */
export const taskStatusEnum = pgEnum('task_status', taskStatusSchema.options);
export const taskPriorityEnum = pgEnum('task_priority', taskPrioritySchema.options);
export const memberRoleEnum = pgEnum('member_role', memberRoleSchema.options);
export const repositoryProviderEnum = pgEnum('repository_provider', repositoryProviderSchema.options);
export const workspaceStatusEnum = pgEnum('workspace_status', workspaceStatusSchema.options);
export const agentRoleEnum = pgEnum('agent_role', agentRoleSchema.options);
export const agentRunStatusEnum = pgEnum('agent_run_status', agentRunStatusSchema.options);
export const agentStepStatusEnum = pgEnum('agent_step_status', agentStepStatusSchema.options);
export const agentToolNameEnum = pgEnum('agent_tool_name', agentToolNameSchema.options);
export const toolCallStatusEnum = pgEnum('tool_call_status', toolCallStatusSchema.options);
export const policyDecisionKindEnum = pgEnum('policy_decision_kind', policyDecisionKindSchema.options);
export const fileChangeTypeEnum = pgEnum('file_change_type', fileChangeTypeSchema.options);
export const pullRequestStatusEnum = pgEnum('pull_request_status', pullRequestStatusSchema.options);
export const testRunStatusEnum = pgEnum('test_run_status', testRunStatusSchema.options);
export const testArtifactKindEnum = pgEnum('test_artifact_kind', testArtifactKindSchema.options);
export const environmentKindEnum = pgEnum('environment_kind', environmentKindSchema.options);
export const deploymentStatusEnum = pgEnum('deployment_status', deploymentStatusSchema.options);
export const knowledgeSourceKindEnum = pgEnum('knowledge_source_kind', knowledgeSourceKindSchema.options);
export const aiMessageRoleEnum = pgEnum('ai_message_role', aiMessageRoleSchema.options);
export const approvalStatusEnum = pgEnum('approval_status', approvalStatusSchema.options);
export const approvalSubjectTypeEnum = pgEnum('approval_subject_type', approvalSubjectTypeSchema.options);
export const secretProviderEnum = pgEnum('secret_provider', secretProviderSchema.options);
export const notificationKindEnum = pgEnum('notification_kind', notificationKindSchema.options);
export const actorTypeEnum = pgEnum('actor_type', actorTypeSchema.options);
