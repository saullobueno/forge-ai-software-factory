import { createHash } from 'node:crypto';
import { hashPassword } from '@forge/domain';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações + servidor HTTP real, sem mocks) para a
 * conexão de `@forge/git` (`MockGitProvider`) a persistência real (Fase 10
 * continuação, na sequência direta da Fase 18): quando uma execução
 * aprovada aplica pelo menos uma escrita real (`write_file`/`apply_patch`,
 * já conectado desde a Fase 18) contra um repositório `provider: 'mock'`,
 * este trabalho abre um PR real (branch+commit+PR, tudo dentro do
 * `MockGitProvider`, nenhuma chamada de rede) e grava
 * `workspaces`/`file_snapshots`/`code_changes`/`diffs`/`pull_requests` reais
 * — não só o resultado simulado que já existia em `toolCall.result`.
 *
 * Mesmo padrão de setup de `agent-run-approval-execution.e2e-spec.ts`
 * (semeia organização/projeto/repositório/tarefa/execução/step/tool call
 * `pending` diretamente no banco, no mesmo estado em que o orquestrador
 * teria deixado ao parar em `approval_required`) — o que se testa aqui é a
 * decisão de aprovação abrindo o PR, não a geração da proposta pelo
 * `MockAiProvider` (que hoje nunca propõe `create_pull_request` — ver o
 * comentário de `AgentRunsService.applyApprovedWrites`).
 */
let testApp: TestApp;

let organizationId: string;
let techLeadToken: string;

const password = 'demo1234';
const REPOSITORY_NAME = 'acme-platform-web';
const TARGET_RELATIVE_PATH = 'src/lib/format-currency.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(currentDir, '..', '..', '..');
const FIXTURE_TARGET_ABSOLUTE_PATH = join(REPO_ROOT, 'fixtures', REPOSITORY_NAME, TARGET_RELATIVE_PATH);
const WORKSPACES_ROOT = join(REPO_ROOT, '.data', 'workspaces');

const createdRepositoryIds: string[] = [];

async function fileHash(path: string): Promise<string> {
  const content = await readFile(path, 'utf8');
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

interface SeededRun {
  agentRunId: string;
  taskId: string;
  taskTitle: string;
  repositoryId: string;
  projectId: string;
}

async function seedPendingWriteRun(options: {
  suffix: string;
  targetPath: string;
  patch: string;
}): Promise<SeededRun> {
  const [project] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId, name: `Project ${options.suffix}`, slug: `project-${options.suffix}-pr-e2e` })
    .returning();
  if (!project) throw new Error('project não inserido');

  const [repository] = await testApp.db
    .insert(testApp.schema.repositories)
    .values({
      organizationId,
      projectId: project.id,
      provider: 'mock',
      owner: 'acme-platform',
      name: REPOSITORY_NAME,
      defaultBranch: 'main',
    })
    .returning();
  if (!repository) throw new Error('repository não inserido');
  createdRepositoryIds.push(repository.id);

  const taskTitle = `Corrigir formatação de moeda (${options.suffix})`;
  const [task] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({ organizationId, projectId: project.id, title: taskTitle })
    .returning();
  if (!task) throw new Error('task não inserida');

  const [agent] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId, role: 'implementer', name: `Implementer ${options.suffix}` })
    .returning();
  if (!agent) throw new Error('agent não inserido');

  const [agentRun] = await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({
      organizationId,
      taskId: task.id,
      agentId: agent.id,
      status: 'approval_required',
      objective: `Implementar: ${taskTitle}`,
    })
    .returning();
  if (!agentRun) throw new Error('agentRun não inserido');

  const [step] = await testApp.db
    .insert(testApp.schema.agentSteps)
    .values({
      agentRunId: agentRun.id,
      name: 'Implementar mudança',
      role: 'implementer',
      status: 'succeeded',
      input: {},
      output: {},
    })
    .returning();
  if (!step) throw new Error('agentStep não inserido');

  await testApp.db.insert(testApp.schema.toolCalls).values({
    agentStepId: step.id,
    toolName: 'apply_patch',
    arguments: { path: options.targetPath, instruction: `Ajustar ${options.targetPath}` },
    result: {
      proposed: { path: options.targetPath, patch: options.patch, additions: 1, deletions: 0 },
      policyDecision: { decision: 'require_approval', reason: 'teste' },
    },
    status: 'pending',
  });

  return { agentRunId: agentRun.id, taskId: task.id, taskTitle, repositoryId: repository.id, projectId: project.id };
}

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org Pull Request E2E', slug: 'org-pull-request-e2e-test' })
    .returning();
  if (!organization) throw new Error('organization não inserida');
  organizationId = organization.id;

  const passwordHash = await hashPassword(password);
  const [techLead] = await testApp.db
    .insert(testApp.schema.users)
    .values({
      organizationId,
      email: 'tech-lead@pull-request-e2e-test.example',
      name: 'Tech Lead',
      role: 'tech_lead',
      passwordHash,
    })
    .returning();
  if (!techLead) throw new Error('tech lead não inserido');

  const login = await request(testApp.app.getHttpServer())
    .post('/auth/login')
    .send({ email: techLead.email, password })
    .expect(200);
  techLeadToken = login.body.token as string;
}, 60_000);

afterAll(async () => {
  for (const repositoryId of createdRepositoryIds) {
    await rm(join(WORKSPACES_ROOT, repositoryId), { recursive: true, force: true });
  }
  await testApp.cleanup();
});

describe('POST /agent-runs/:id/approve — abre um PR real via MockGitProvider (Fase 10 continuação)', () => {
  it('persiste pullRequests/codeChanges/diffs/fileSnapshots reais e consistentes, e nunca toca o fixture original', async () => {
    const originalHashBefore = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);
    const originalContent = await readFile(FIXTURE_TARGET_ABSOLUTE_PATH, 'utf8');
    const [firstLine] = originalContent.split('\n');

    const patch = [
      `--- a/${TARGET_RELATIVE_PATH}`,
      `+++ b/${TARGET_RELATIVE_PATH}`,
      '@@ -1,1 +1,2 @@',
      ` ${firstLine ?? ''}`,
      '+// Forge: PR real via e2e (agent-run-pull-request.e2e-spec.ts)',
    ].join('\n');

    const seeded = await seedPendingWriteRun({ suffix: 'success', targetPath: TARGET_RELATIVE_PATH, patch });

    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${seeded.agentRunId}/approve`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .send({ reason: 'Patch revisado, seguro para aplicar de verdade.' })
      .expect(200);
    expect(response.body.status).toBe('completed');

    // 1) O arquivo real escrito na cópia isolada do workspace (Fase 18) é o
    // mesmo que vira o "depois" do fileSnapshot — comparado por hash, não
    // por autorrelato.
    const writtenPath = join(WORKSPACES_ROOT, seeded.repositoryId, TARGET_RELATIVE_PATH);
    const writtenContent = await readFile(writtenPath, 'utf8');
    const writtenHash = createHash('sha256').update(writtenContent, 'utf8').digest('hex');

    // 2) `fixtures/acme-platform-web/` original NUNCA foi tocado.
    const originalHashAfter = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);
    expect(originalHashAfter).toBe(originalHashBefore);
    expect(originalHashAfter).not.toBe(writtenHash);

    // 3) `GET /agent-runs/:id` inclui o pullRequest real criado.
    const persisted = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${seeded.agentRunId}`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);
    expect(persisted.body.pullRequests).toHaveLength(1);
    const pullRequestFromApi = persisted.body.pullRequests[0];
    expect(pullRequestFromApi.status).toBe('open');
    expect(pullRequestFromApi.provider).toBe('mock');
    expect(pullRequestFromApi.sourceBranch).toContain('corrigir-formatacao-de-moeda-success');
    expect(pullRequestFromApi.targetBranch).toBe('main');
    expect(pullRequestFromApi.externalUrl).toContain('acme-platform');

    // 4) A linha real em `pull_requests` bate com a resposta da API.
    const { and, eq } = await import('@forge/database');
    const [pullRequestRow] = await testApp.db.query.pullRequests.findMany({
      where: and(
        eq(testApp.schema.pullRequests.organizationId, organizationId),
        eq(testApp.schema.pullRequests.agentRunId, seeded.agentRunId),
      ),
      limit: 1,
    });
    expect(pullRequestRow).toBeDefined();
    expect(pullRequestRow?.id).toBe(pullRequestFromApi.id);
    expect(pullRequestRow?.repositoryId).toBe(seeded.repositoryId);
    expect(pullRequestRow?.taskId).toBe(seeded.taskId);
    expect(pullRequestRow?.projectId).toBe(seeded.projectId);

    // 5) `codeChanges`/`diffs`/`fileSnapshots` reais, ligados ao mesmo
    // workspace do PR, com o hash do snapshot "depois" batendo com o
    // arquivo real escrito em disco (prova de consistência, não confiança
    // cega no que o serviço reportou).
    const [codeChange] = await testApp.db.query.codeChanges.findMany({
      where: and(
        eq(testApp.schema.codeChanges.organizationId, organizationId),
        eq(testApp.schema.codeChanges.agentRunId, seeded.agentRunId),
      ),
      with: { afterSnapshot: true, beforeSnapshot: true },
      limit: 1,
    });
    expect(codeChange).toBeDefined();
    expect(codeChange?.filePath).toBe(TARGET_RELATIVE_PATH);
    expect(codeChange?.changeType).toBe('modified');
    expect(codeChange?.workspaceId).toBe(pullRequestRow?.workspaceId);
    expect(codeChange?.afterSnapshot?.contentHash).toBe(writtenHash);
    expect(codeChange?.afterSnapshot?.sizeBytes).toBe(Buffer.byteLength(writtenContent, 'utf8'));
    expect(codeChange?.beforeSnapshot?.contentHash).toBe(originalHashBefore);

    const [diffRow] = await testApp.db.query.diffs.findMany({
      where: and(eq(testApp.schema.diffs.organizationId, organizationId), eq(testApp.schema.diffs.codeChangeId, codeChange!.id)),
      limit: 1,
    });
    expect(diffRow).toBeDefined();
    expect(diffRow?.patch).toBe(patch);
    expect(diffRow?.additions).toBeGreaterThan(0);

    // 6) `workspaces` real, com `worktreePath` apontando para a cópia
    // isolada real usada pela Fase 18 (não um caminho inventado).
    const workspaceRow = await testApp.db.query.workspaces.findFirst({
      where: eq(testApp.schema.workspaces.id, pullRequestRow!.workspaceId!),
    });
    expect(workspaceRow?.worktreePath).toBe(join(WORKSPACES_ROOT, seeded.repositoryId));
    expect(workspaceRow?.branchName).toBe(pullRequestRow?.sourceBranch);
  });

  it('não abre PR quando nenhuma escrita real foi aplicada (todas as tool calls pendentes falharam)', async () => {
    const brokenPatch = [
      `--- a/${TARGET_RELATIVE_PATH}`,
      `+++ b/${TARGET_RELATIVE_PATH}`,
      '@@ -1,1 +1,2 @@',
      ' ESTA_LINHA_NAO_EXISTE_NO_ARQUIVO_DE_VERDADE_XYZ',
      '+// nunca deveria aplicar',
    ].join('\n');

    const seeded = await seedPendingWriteRun({ suffix: 'broken-patch', targetPath: TARGET_RELATIVE_PATH, patch: brokenPatch });

    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${seeded.agentRunId}/approve`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);
    expect(response.body.status).toBe('failed');

    const persisted = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${seeded.agentRunId}`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);
    expect(persisted.body.pullRequests).toEqual([]);
  });
});
