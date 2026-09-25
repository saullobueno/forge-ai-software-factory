import { relations } from 'drizzle-orm';
import { organizations, users, teams, teamMembers, roles } from './organizations.ts';
import { projects, repositories } from './projects.ts';
import { tasks, taskDependencies } from './tasks.ts';
import { workspaces } from './workspaces.ts';
import { agents, agentRuns, agentSteps, toolCalls } from './agents.ts';
import { policies, policyDecisions } from './policies.ts';
import { aiMessages, aiUsages } from './ai.ts';
import { fileSnapshots, codeChanges, diffs, pullRequests } from './git.ts';
import { testRuns, testSuites, testArtifacts } from './testing.ts';
import { environments, deployments } from './environments.ts';
import { knowledgeSources, knowledgeChunks } from './knowledge.ts';
import { approvals } from './approvals.ts';
import { secretReferences } from './secrets.ts';
import { notifications } from './notifications.ts';
import { auditLogs } from './audit.ts';

/**
 * Todas as relations() do schema ficam centralizadas neste arquivo para
 * evitar imports circulares entre os arquivos de tabela por domínio (cada
 * um só importa os módulos de que precisa para colunas de FK, seguindo um
 * grafo de dependência acíclico: organizations -> projects -> tasks ->
 * workspaces -> agents -> policies/ai -> git -> testing -> environments ->
 * knowledge -> approvals/secrets/notifications/audit).
 */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  teams: many(teams),
  roles: many(roles),
  projects: many(projects),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  teamMemberships: many(teamMembers),
  assignedTasks: many(tasks),
  notifications: many(notifications),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, { fields: [teams.organizationId], references: [organizations.id] }),
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const rolesRelations = relations(roles, ({ one }) => ({
  organization: one(organizations, { fields: [roles.organizationId], references: [organizations.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  repositories: many(repositories),
  tasks: many(tasks),
  workspaces: many(workspaces),
  environments: many(environments),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [repositories.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [repositories.projectId], references: [projects.id] }),
  workspaces: many(workspaces),
  pullRequests: many(pullRequests),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  organization: one(organizations, { fields: [tasks.organizationId], references: [organizations.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  workspaces: many(workspaces),
  agentRuns: many(agentRuns),
  dependencies: many(taskDependencies, { relationName: 'task_dependencies_task' }),
  dependents: many(taskDependencies, { relationName: 'task_dependencies_depends_on' }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: 'task_dependencies_task',
  }),
  dependsOnTask: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: 'task_dependencies_depends_on',
  }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [workspaces.projectId], references: [projects.id] }),
  repository: one(repositories, {
    fields: [workspaces.repositoryId],
    references: [repositories.id],
  }),
  task: one(tasks, { fields: [workspaces.taskId], references: [tasks.id] }),
  agentRuns: many(agentRuns),
  fileSnapshots: many(fileSnapshots),
  codeChanges: many(codeChanges),
  testRuns: many(testRuns),
  knowledgeSources: many(knowledgeSources),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, { fields: [agents.organizationId], references: [organizations.id] }),
  runs: many(agentRuns),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agentRuns.organizationId],
    references: [organizations.id],
  }),
  task: one(tasks, { fields: [agentRuns.taskId], references: [tasks.id] }),
  agent: one(agents, { fields: [agentRuns.agentId], references: [agents.id] }),
  workspace: one(workspaces, { fields: [agentRuns.workspaceId], references: [workspaces.id] }),
  steps: many(agentSteps),
  codeChanges: many(codeChanges),
  testRuns: many(testRuns),
  usages: many(aiUsages),
  pullRequests: many(pullRequests),
}));

export const agentStepsRelations = relations(agentSteps, ({ one, many }) => ({
  agentRun: one(agentRuns, { fields: [agentSteps.agentRunId], references: [agentRuns.id] }),
  toolCalls: many(toolCalls),
  messages: many(aiMessages),
  usages: many(aiUsages),
}));

export const toolCallsRelations = relations(toolCalls, ({ one, many }) => ({
  agentStep: one(agentSteps, { fields: [toolCalls.agentStepId], references: [agentSteps.id] }),
  policyDecisions: many(policyDecisions),
  messages: many(aiMessages),
}));

export const policiesRelations = relations(policies, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [policies.organizationId],
    references: [organizations.id],
  }),
  decisions: many(policyDecisions),
}));

export const policyDecisionsRelations = relations(policyDecisions, ({ one }) => ({
  organization: one(organizations, {
    fields: [policyDecisions.organizationId],
    references: [organizations.id],
  }),
  policy: one(policies, { fields: [policyDecisions.policyId], references: [policies.id] }),
  toolCall: one(toolCalls, { fields: [policyDecisions.toolCallId], references: [toolCalls.id] }),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [aiMessages.organizationId],
    references: [organizations.id],
  }),
  agentStep: one(agentSteps, { fields: [aiMessages.agentStepId], references: [agentSteps.id] }),
  toolCall: one(toolCalls, { fields: [aiMessages.toolCallId], references: [toolCalls.id] }),
  usages: many(aiUsages),
}));

export const aiUsagesRelations = relations(aiUsages, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiUsages.organizationId],
    references: [organizations.id],
  }),
  agentRun: one(agentRuns, { fields: [aiUsages.agentRunId], references: [agentRuns.id] }),
  agentStep: one(agentSteps, { fields: [aiUsages.agentStepId], references: [agentSteps.id] }),
  aiMessage: one(aiMessages, { fields: [aiUsages.aiMessageId], references: [aiMessages.id] }),
}));

export const fileSnapshotsRelations = relations(fileSnapshots, ({ one }) => ({
  organization: one(organizations, {
    fields: [fileSnapshots.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, { fields: [fileSnapshots.workspaceId], references: [workspaces.id] }),
}));

export const codeChangesRelations = relations(codeChanges, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [codeChanges.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, { fields: [codeChanges.workspaceId], references: [workspaces.id] }),
  agentRun: one(agentRuns, { fields: [codeChanges.agentRunId], references: [agentRuns.id] }),
  beforeSnapshot: one(fileSnapshots, {
    fields: [codeChanges.beforeSnapshotId],
    references: [fileSnapshots.id],
  }),
  afterSnapshot: one(fileSnapshots, {
    fields: [codeChanges.afterSnapshotId],
    references: [fileSnapshots.id],
  }),
  diffs: many(diffs),
}));

export const diffsRelations = relations(diffs, ({ one }) => ({
  organization: one(organizations, { fields: [diffs.organizationId], references: [organizations.id] }),
  codeChange: one(codeChanges, { fields: [diffs.codeChangeId], references: [codeChanges.id] }),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [pullRequests.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [pullRequests.projectId], references: [projects.id] }),
  repository: one(repositories, {
    fields: [pullRequests.repositoryId],
    references: [repositories.id],
  }),
  workspace: one(workspaces, { fields: [pullRequests.workspaceId], references: [workspaces.id] }),
  task: one(tasks, { fields: [pullRequests.taskId], references: [tasks.id] }),
  agentRun: one(agentRuns, { fields: [pullRequests.agentRunId], references: [agentRuns.id] }),
  deployments: many(deployments),
}));

export const testRunsRelations = relations(testRuns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [testRuns.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [testRuns.projectId], references: [projects.id] }),
  workspace: one(workspaces, { fields: [testRuns.workspaceId], references: [workspaces.id] }),
  agentRun: one(agentRuns, { fields: [testRuns.agentRunId], references: [agentRuns.id] }),
  triggeredByUser: one(users, { fields: [testRuns.triggeredByUserId], references: [users.id] }),
  suites: many(testSuites),
  artifacts: many(testArtifacts),
}));

export const testSuitesRelations = relations(testSuites, ({ one, many }) => ({
  testRun: one(testRuns, { fields: [testSuites.testRunId], references: [testRuns.id] }),
  artifacts: many(testArtifacts),
}));

export const testArtifactsRelations = relations(testArtifacts, ({ one }) => ({
  testRun: one(testRuns, { fields: [testArtifacts.testRunId], references: [testRuns.id] }),
  testSuite: one(testSuites, { fields: [testArtifacts.testSuiteId], references: [testSuites.id] }),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [environments.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [environments.projectId], references: [projects.id] }),
  deployments: many(deployments),
  secretReferences: many(secretReferences),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  organization: one(organizations, {
    fields: [deployments.organizationId],
    references: [organizations.id],
  }),
  environment: one(environments, {
    fields: [deployments.environmentId],
    references: [environments.id],
  }),
  project: one(projects, { fields: [deployments.projectId], references: [projects.id] }),
  pullRequest: one(pullRequests, {
    fields: [deployments.pullRequestId],
    references: [pullRequests.id],
  }),
  deployedByUser: one(users, { fields: [deployments.deployedByUserId], references: [users.id] }),
}));

export const knowledgeSourcesRelations = relations(knowledgeSources, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [knowledgeSources.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [knowledgeSources.projectId], references: [projects.id] }),
  workspace: one(workspaces, {
    fields: [knowledgeSources.workspaceId],
    references: [workspaces.id],
  }),
  chunks: many(knowledgeChunks),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  source: one(knowledgeSources, {
    fields: [knowledgeChunks.knowledgeSourceId],
    references: [knowledgeSources.id],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  organization: one(organizations, {
    fields: [approvals.organizationId],
    references: [organizations.id],
  }),
  requestedByUser: one(users, {
    fields: [approvals.requestedByUserId],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [approvals.approvedByUserId],
    references: [users.id],
  }),
}));

export const secretReferencesRelations = relations(secretReferences, ({ one }) => ({
  organization: one(organizations, {
    fields: [secretReferences.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [secretReferences.projectId], references: [projects.id] }),
  environment: one(environments, {
    fields: [secretReferences.environmentId],
    references: [environments.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, {
    fields: [notifications.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  actorUser: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
