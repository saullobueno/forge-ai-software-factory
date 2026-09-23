import { authorizeToolCall } from '@forge/domain';
import { and, eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../client.ts';
import {
  agentRuns,
  agents,
  agentSteps,
  approvals,
  auditLogs,
  codeChanges,
  diffs,
  fileSnapshots,
  notifications,
  organizations,
  projects,
  pullRequests,
  repositories,
  tasks,
  testRuns,
  workspaces,
} from '../schema/index.ts';
import { runSeed, type SeedSummary } from './run-seed.ts';
import { toolCallStatusForPolicyDecision } from './tool-call-policy.ts';

/**
 * Teste de integração real (spec §22), mesmo padrão de
 * `../schema/integration.test.ts`: sobe um Postgres real embarcado
 * (PGlite) num diretório temporário isolado, aplica as migrações geradas
 * e roda `runSeed` do zero contra ele — nada aqui é mockado.
 */
let db: Database;
let closeDatabase: () => Promise<void>;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'forge-db-seed-integration-'));
  process.env['DATABASE_LOCAL_PATH'] = join(dataDir, 'forge-seed-test.pglite');

  const { createDatabase } = await import('../client');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const created = createDatabase();
  db = created.db;
  closeDatabase = created.close;

  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: './drizzle' });
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env['DATABASE_LOCAL_PATH'];
});

describe('runSeed (PGlite + migrações reais)', () => {
  let firstSummary: Extract<SeedSummary, { alreadySeeded: false }>;

  it('roda o seed completo do zero e cria o grafo inteiro, corretamente ligado', async () => {
    const summary = await runSeed(db);
    expect(summary.alreadySeeded).toBe(false);
    if (summary.alreadySeeded) throw new Error('runSeed deveria ter criado tudo na primeira chamada');
    firstSummary = summary;

    // organization -> project -> repository -> workspace -> task
    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, firstSummary.organizationId),
    });
    if (!organization) throw new Error('organization não encontrada');
    expect(organization.slug).toBe('acme-platform');

    const project = await db.query.projects.findFirst({ where: eq(projects.id, firstSummary.projectId) });
    if (!project) throw new Error('project não encontrado');
    expect(project.organizationId).toBe(organization.id);

    const repository = await db.query.repositories.findFirst({
      where: eq(repositories.id, firstSummary.repositoryId),
    });
    if (!repository) throw new Error('repository não encontrado');
    expect(repository.projectId).toBe(project.id);
    expect(repository.provider).toBe('mock');
    expect(repository.owner).toBe('acme-platform');
    expect(repository.name).toBe('acme-platform-web');

    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, firstSummary.workspaceId) });
    if (!workspace) throw new Error('workspace não encontrado');
    expect(workspace.repositoryId).toBe(repository.id);
    expect(workspace.taskId).toBe(firstSummary.demoTaskId);
    expect(workspace.branchName).toBe('fix/currency-formatting-negative-values');

    const demoTask = await db.query.tasks.findFirst({ where: eq(tasks.id, firstSummary.demoTaskId) });
    if (!demoTask) throw new Error('demo task não encontrada');
    expect(demoTask.projectId).toBe(project.id);
    expect(demoTask.status).toBe('done');

    // 6 agentes de sistema (um por papel — spec §8)
    const orgAgents = await db.query.agents.findMany({ where: eq(agents.organizationId, organization.id) });
    expect(orgAgents).toHaveLength(6);
    expect(new Set(orgAgents.map((a) => a.role)).size).toBe(6);

    // task -> agentRun -> agentSteps -> toolCalls
    const agentRun = await db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, firstSummary.agentRunId),
      with: { steps: { with: { toolCalls: true } } },
    });
    if (!agentRun) throw new Error('agentRun não encontrado');
    expect(agentRun.taskId).toBe(demoTask.id);
    expect(agentRun.workspaceId).toBe(workspace.id);
    expect(agentRun.status).toBe('completed');
    expect(agentRun.steps).toHaveLength(6);

    const stepsByRole = new Map(agentRun.steps.map((step) => [step.role, step]));
    expect(
      [...stepsByRole.keys()].sort(),
    ).toEqual(
      ['code_explorer', 'documentation_agent', 'implementer', 'planner', 'reviewer', 'test_engineer'].sort(),
    );
    expect(agentRun.steps.every((step) => step.status === 'succeeded')).toBe(true);

    const reviewerStep = stepsByRole.get('reviewer');
    if (!reviewerStep) throw new Error('reviewer step não encontrado');
    const findings = (reviewerStep.output as { findings?: unknown[] } | null)?.findings;
    expect(Array.isArray(findings)).toBe(true);
    expect((findings ?? []).length).toBeGreaterThan(0);

    const implementerStep = stepsByRole.get('implementer');
    if (!implementerStep) throw new Error('implementer step não encontrado');
    expect(implementerStep.toolCalls.some((call) => call.toolName === 'apply_patch')).toBe(true);

    // diff -> codeChange -> fileSnapshots (antes/depois)
    const codeChange = await db.query.codeChanges.findFirst({ where: eq(codeChanges.id, firstSummary.codeChangeId) });
    if (!codeChange) throw new Error('codeChange não encontrado');
    expect(codeChange.workspaceId).toBe(workspace.id);
    expect(codeChange.agentRunId).toBe(agentRun.id);
    expect(codeChange.changeType).toBe('modified');
    if (!codeChange.beforeSnapshotId || !codeChange.afterSnapshotId) {
      throw new Error('codeChange sem snapshots antes/depois');
    }

    const beforeSnapshot = await db.query.fileSnapshots.findFirst({
      where: eq(fileSnapshots.id, codeChange.beforeSnapshotId),
    });
    const afterSnapshot = await db.query.fileSnapshots.findFirst({
      where: eq(fileSnapshots.id, codeChange.afterSnapshotId),
    });
    expect(beforeSnapshot?.workspaceId).toBe(workspace.id);
    expect(afterSnapshot?.workspaceId).toBe(workspace.id);
    expect(beforeSnapshot?.contentHash).not.toBe(afterSnapshot?.contentHash);

    const diff = await db.query.diffs.findFirst({ where: eq(diffs.id, firstSummary.diffId) });
    if (!diff) throw new Error('diff não encontrado');
    expect(diff.codeChangeId).toBe(codeChange.id);
    expect(diff.patch).toContain('Math.abs');
    expect(diff.additions).toBeGreaterThan(0);
    expect(diff.deletions).toBeGreaterThan(0);

    // testRun -> testSuites
    const testRun = await db.query.testRuns.findFirst({
      where: eq(testRuns.id, firstSummary.testRunId),
      with: { suites: true },
    });
    if (!testRun) throw new Error('testRun não encontrado');
    expect(testRun.status).toBe('passed');
    expect(testRun.suites).toHaveLength(2);
    expect(testRun.suites.every((suite) => suite.failedCount === 0)).toBe(true);
    expect(testRun.suites.some((suite) => suite.passedCount > 0)).toBe(true);

    // pullRequest ligada a repository/workspace/task
    const pullRequest = await db.query.pullRequests.findFirst({
      where: eq(pullRequests.id, firstSummary.pullRequestId),
    });
    if (!pullRequest) throw new Error('pullRequest não encontrada');
    expect(pullRequest.repositoryId).toBe(repository.id);
    expect(pullRequest.workspaceId).toBe(workspace.id);
    expect(pullRequest.taskId).toBe(demoTask.id);
    expect(pullRequest.sourceBranch).toBe(workspace.branchName);
    expect(pullRequest.targetBranch).toBe(repository.defaultBranch);
    expect(pullRequest.status).toBe('merged');

    // approval do agentRun
    const approval = await db.query.approvals.findFirst({ where: eq(approvals.id, firstSummary.approvalId) });
    if (!approval) throw new Error('approval não encontrada');
    expect(approval.organizationId).toBe(organization.id);
    expect(approval.subjectType).toBe('agent_run');
    expect(approval.subjectId).toBe(agentRun.id);
    expect(approval.status).toBe('approved');

    // notifications e auditLog da organização
    const orgNotifications = await db.query.notifications.findMany({
      where: eq(notifications.organizationId, organization.id),
    });
    expect(orgNotifications.length).toBeGreaterThanOrEqual(3);

    const orgAuditLogs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.organizationId, organization.id),
    });
    expect(orgAuditLogs.length).toBeGreaterThanOrEqual(3);
  });

  it('é idempotente: rodar de novo não duplica organization/task/agentRun', async () => {
    const secondSummary = await runSeed(db);
    expect(secondSummary.alreadySeeded).toBe(true);
    expect(secondSummary.organizationId).toBe(firstSummary.organizationId);

    const allOrganizations = await db.query.organizations.findMany({
      where: eq(organizations.slug, 'acme-platform'),
    });
    expect(allOrganizations).toHaveLength(1);

    const allDemoTasks = await db.query.tasks.findMany({
      where: eq(tasks.title, 'Estornos aparecem como cobrança positiva na fatura'),
    });
    expect(allDemoTasks).toHaveLength(1);

    const allAgentRuns = await db.query.agentRuns.findMany({
      where: eq(agentRuns.organizationId, firstSummary.organizationId),
    });
    expect(allAgentRuns).toHaveLength(1);
  });

  it('o toolCall sensível "apply_patch" tem status consistente com a política real de @forge/domain', async () => {
    const implementerStep = await db.query.agentSteps.findFirst({
      where: and(eq(agentSteps.agentRunId, firstSummary.agentRunId), eq(agentSteps.role, 'implementer')),
      with: { toolCalls: true },
    });
    if (!implementerStep) throw new Error('implementer step não encontrado');

    const applyPatchCall = implementerStep.toolCalls.find((call) => call.toolName === 'apply_patch');
    if (!applyPatchCall) throw new Error('toolCall apply_patch não encontrado');

    // Recalcula a decisão com o MESMO ator/argumentos usados no seed
    // (developer, na organização demo) — prova consistência de verdade,
    // não uma comparação de enums desacoplada da lógica real de política.
    const recomputed = authorizeToolCall({
      actor: { role: 'developer', organizationId: firstSummary.organizationId },
      resourceOrganizationId: firstSummary.organizationId,
      toolName: 'apply_patch',
      args: applyPatchCall.arguments,
    });

    expect(recomputed.decision).toBe('require_approval');
    expect(toolCallStatusForPolicyDecision(recomputed.decision)).toBe(applyPatchCall.status);

    const storedDecision = (applyPatchCall.result as { policyDecision?: { decision: string } } | null)
      ?.policyDecision;
    expect(storedDecision?.decision).toBe(recomputed.decision);

    // "succeeded" só é coerente aqui porque existe uma Approval aprovada
    // para o AgentRun que autorizou esta tool call sensível.
    const approval = await db.query.approvals.findFirst({
      where: and(eq(approvals.subjectType, 'agent_run'), eq(approvals.subjectId, firstSummary.agentRunId)),
    });
    expect(approval?.status).toBe('approved');
  });

  it('toolCalls somente-leitura (ex. list_files) resolvem "allow" -> "succeeded"', async () => {
    const explorerStep = await db.query.agentSteps.findFirst({
      where: and(eq(agentSteps.agentRunId, firstSummary.agentRunId), eq(agentSteps.role, 'code_explorer')),
      with: { toolCalls: true },
    });
    if (!explorerStep) throw new Error('code_explorer step não encontrado');

    const listFilesCall = explorerStep.toolCalls.find((call) => call.toolName === 'list_files');
    if (!listFilesCall) throw new Error('toolCall list_files não encontrado');

    const recomputed = authorizeToolCall({
      actor: { role: 'developer', organizationId: firstSummary.organizationId },
      resourceOrganizationId: firstSummary.organizationId,
      toolName: 'list_files',
      args: listFilesCall.arguments,
    });

    expect(recomputed.decision).toBe('allow');
    expect(toolCallStatusForPolicyDecision(recomputed.decision)).toBe('succeeded');
    expect(listFilesCall.status).toBe('succeeded');
  });
});
