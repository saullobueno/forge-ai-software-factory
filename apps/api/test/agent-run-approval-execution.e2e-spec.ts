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
 * conexão de execução real atrás da aprovação humana (spec §18 — este
 * trabalho, na sequência da Fase 17): quando um `tech_lead` aprova uma
 * execução em `approval_required`, toda tool call `apply_patch`/
 * `write_file` pendente É aplicada de verdade contra uma cópia isolada e
 * descartável do repositório (`.data/workspaces/<repositoryId>/`) — nunca
 * `fixtures/acme-platform-web/` original.
 *
 * Este arquivo fica separado de `agent-runs.e2e-spec.ts` (que já cobre
 * 403/404/409 do fluxo de aprovação em si, sem nenhum projeto com
 * repositório configurado — prova, sem querer, que a ausência de
 * repositório continua degradando graciosamente depois desta mudança)
 * porque o cerne daqui é outro: arquivo real mudando em disco, o fixture
 * original nunca sendo tocado, uma falha real de patch derrubando a
 * execução para `failed` mesmo tendo sido aprovada, e `run_command`
 * continuando simulado mesmo depois de aprovado.
 */
let testApp: TestApp;

let organizationId: string;
let techLeadToken: string;
let techLeadId: string;

const password = 'demo1234';
const REPOSITORY_NAME = 'acme-platform-web';
const TARGET_RELATIVE_PATH = 'src/lib/format-currency.ts';

// `apps/api/test/agent-run-approval-execution.e2e-spec.ts` -> `apps/api` ->
// `apps` -> raiz do monorepo: mesmo cálculo usado por
// `agent-runs.e2e-spec.ts` para `ARTIFACTS_ROOT`.
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
  toolCallId: string;
  repositoryId: string;
}

/**
 * Insere organização/projeto/repositório/tarefa/agente/execução/step/tool
 * call `pending` reais — a mesma forma que o orquestrador teria deixado ao
 * parar em `approval_required` (ver `AgentRunOrchestrator.run` em
 * `packages/agents/src/orchestrator.ts`), sem passar pelo pipeline inteiro
 * (fora de escopo aqui: o que se testa é a decisão de aprovação, não a
 * geração da proposta).
 */
async function seedPendingWriteRun(options: {
  suffix: string;
  toolName: 'apply_patch' | 'write_file';
  targetPath: string;
  patch: string;
}): Promise<SeededRun> {
  const [project] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId, name: `Project ${options.suffix}`, slug: `project-${options.suffix}-approval-exec-e2e` })
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

  const [task] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({ organizationId, projectId: project.id, title: `Tarefa ${options.suffix}` })
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
      objective: `Execução real de teste (${options.suffix})`,
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

  const [toolCall] = await testApp.db
    .insert(testApp.schema.toolCalls)
    .values({
      agentStepId: step.id,
      toolName: options.toolName,
      arguments: { path: options.targetPath, instruction: `Ajustar ${options.targetPath}` },
      result: {
        proposed: { path: options.targetPath, patch: options.patch, additions: 1, deletions: 0 },
        policyDecision: { decision: 'require_approval', reason: 'teste' },
      },
      status: 'pending',
    })
    .returning();
  if (!toolCall) throw new Error('toolCall não inserido');

  return { agentRunId: agentRun.id, toolCallId: toolCall.id, repositoryId: repository.id };
}

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org Approval Execution E2E', slug: 'org-approval-execution-e2e-test' })
    .returning();
  if (!organization) throw new Error('organization não inserida');
  organizationId = organization.id;

  const passwordHash = await hashPassword(password);
  const [techLead] = await testApp.db
    .insert(testApp.schema.users)
    .values({
      organizationId,
      email: 'tech-lead@approval-execution-e2e-test.example',
      name: 'Tech Lead',
      role: 'tech_lead',
      passwordHash,
    })
    .returning();
  if (!techLead) throw new Error('tech lead não inserido');
  techLeadId = techLead.id;

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

describe('POST /agent-runs/:id/approve — execução real atrás da aprovação (write_file/apply_patch)', () => {
  it('aplica o patch aprovado de verdade na cópia isolada do workspace, e NUNCA no fixture original', async () => {
    const originalHashBefore = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);
    const originalContent = await readFile(FIXTURE_TARGET_ABSOLUTE_PATH, 'utf8');
    const [firstLine] = originalContent.split('\n');

    const patch = [
      `--- a/${TARGET_RELATIVE_PATH}`,
      `+++ b/${TARGET_RELATIVE_PATH}`,
      '@@ -1,1 +1,2 @@',
      ` ${firstLine ?? ''}`,
      '+// Forge: aprovado via e2e real (agent-run-approval-execution.e2e-spec.ts)',
    ].join('\n');

    const seeded = await seedPendingWriteRun({
      suffix: 'success',
      toolName: 'apply_patch',
      targetPath: TARGET_RELATIVE_PATH,
      patch,
    });

    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${seeded.agentRunId}/approve`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .send({ reason: 'Patch revisado, seguro para aplicar de verdade.' })
      .expect(200);

    expect(response.body.status).toBe('completed');

    // 1) O arquivo REALMENTE mudou em disco, dentro da cópia isolada.
    const writtenPath = join(WORKSPACES_ROOT, seeded.repositoryId, TARGET_RELATIVE_PATH);
    const writtenContent = await readFile(writtenPath, 'utf8');
    expect(writtenContent).toContain('// Forge: aprovado via e2e real (agent-run-approval-execution.e2e-spec.ts)');
    expect(writtenContent).not.toBe(originalContent);

    // 2) fixtures/acme-platform-web/ original NUNCA foi tocado — mesmo
    // hash de antes da aprovação, byte a byte.
    const originalHashAfter = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);
    expect(originalHashAfter).toBe(originalHashBefore);

    // 3) O toolCall.result foi REESCRITO com o resultado real (hash/tamanho
    // do arquivo resultante) — não é mais o resultado simulado como se
    // fosse final.
    const persisted = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${seeded.agentRunId}`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);
    const toolCall = persisted.body.steps
      .flatMap((step: { toolCalls: Array<{ id: string; status: string; result: Record<string, unknown> }> }) => step.toolCalls)
      .find((call: { id: string }) => call.id === seeded.toolCallId);
    expect(toolCall.status).toBe('succeeded');
    expect(toolCall.result.sha256).toBe(createHash('sha256').update(writtenContent, 'utf8').digest('hex'));
    expect(toolCall.result.sizeBytes).toBe(Buffer.byteLength(writtenContent, 'utf8'));
    expect(toolCall.result.proposed).toBeUndefined();

    // 4) Audit log dedicado do efeito real.
    const { and, eq } = await import('@forge/database');
    const [changesLog] = await testApp.db.query.auditLogs.findMany({
      where: and(
        eq(testApp.schema.auditLogs.action, 'agent_run.changes_applied'),
        eq(testApp.schema.auditLogs.targetId, seeded.agentRunId),
      ),
      limit: 1,
    });
    expect(changesLog).toMatchObject({ organizationId, action: 'agent_run.changes_applied' });
    expect((changesLog?.metadata as { appliedWrites?: unknown[] })?.appliedWrites).toHaveLength(1);
  });

  it('quando o patch aprovado NÃO aplica limpo, a execução vai para failed mesmo tendo sido aprovada — a aprovação não "funciona" silenciosamente', async () => {
    const brokenPatch = [
      `--- a/${TARGET_RELATIVE_PATH}`,
      `+++ b/${TARGET_RELATIVE_PATH}`,
      '@@ -1,1 +1,2 @@',
      ' ESTA_LINHA_NAO_EXISTE_NO_ARQUIVO_DE_VERDADE_XYZ',
      '+// nunca deveria aplicar',
    ].join('\n');

    const originalHashBefore = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);

    const seeded = await seedPendingWriteRun({
      suffix: 'broken-patch',
      toolName: 'apply_patch',
      targetPath: TARGET_RELATIVE_PATH,
      patch: brokenPatch,
    });

    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${seeded.agentRunId}/approve`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    // A transição HTTP é 200 (a decisão em si foi processada), mas o status
    // final da execução é "failed", não "completed" — a falha real de
    // aplicação do patch é o que decide o desfecho, não a intenção humana
    // de aprovar.
    expect(response.body.status).toBe('failed');

    const persisted = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${seeded.agentRunId}`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);
    expect(persisted.body.status).toBe('failed');
    const toolCall = persisted.body.steps
      .flatMap((step: { toolCalls: Array<{ id: string; status: string; result: Record<string, unknown> }> }) => step.toolCalls)
      .find((call: { id: string }) => call.id === seeded.toolCallId);
    expect(toolCall.status).toBe('failed');
    expect(String(toolCall.result.error)).toMatch(/não aplicou de forma limpa/);

    // O fixture original continua intocado mesmo no caminho de falha.
    const originalHashAfter = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);
    expect(originalHashAfter).toBe(originalHashBefore);

    const { and, eq } = await import('@forge/database');
    const [approvalRow] = await testApp.db.query.approvals.findMany({
      where: and(
        eq(testApp.schema.approvals.subjectType, 'agent_run'),
        eq(testApp.schema.approvals.subjectId, seeded.agentRunId),
      ),
      limit: 1,
    });
    // A decisão HUMANA registrada continua "approved" (o tech lead
    // realmente aprovou) — é o status da EXECUÇÃO que diverge para
    // "failed" por causa da falha técnica real, não a linha de `approvals`.
    expect(approvalRow?.status).toBe('approved');
    expect(approvalRow?.approvedByUserId).toBe(techLeadId);
  });

  it('run_command continua simulado mesmo depois de aprovado — nenhum processo real é executado', async () => {
    const proposedCommand = { command: 'node', args: ['-e', "require('fs').writeFileSync('should-not-exist.txt','x')"] };

    const [project] = await testApp.db
      .insert(testApp.schema.projects)
      .values({ organizationId, name: 'Project run-command', slug: 'project-run-command-approval-exec-e2e' })
      .returning();
    if (!project) throw new Error('project não inserido');
    const [task] = await testApp.db
      .insert(testApp.schema.tasks)
      .values({ organizationId, projectId: project.id, title: 'Tarefa run-command' })
      .returning();
    if (!task) throw new Error('task não inserida');
    const [agent] = await testApp.db
      .insert(testApp.schema.agents)
      .values({ organizationId, role: 'implementer', name: 'Implementer run-command' })
      .returning();
    if (!agent) throw new Error('agent não inserido');
    const [agentRun] = await testApp.db
      .insert(testApp.schema.agentRuns)
      .values({
        organizationId,
        taskId: task.id,
        agentId: agent.id,
        status: 'approval_required',
        objective: 'Execução com run_command pendente',
      })
      .returning();
    if (!agentRun) throw new Error('agentRun não inserido');
    const [step] = await testApp.db
      .insert(testApp.schema.agentSteps)
      .values({ agentRunId: agentRun.id, name: 'Rodar comando', role: 'implementer', status: 'succeeded', input: {}, output: {} })
      .returning();
    if (!step) throw new Error('agentStep não inserido');

    const originalResult = {
      proposed: proposedCommand,
      policyDecision: { decision: 'require_approval', reason: 'teste' },
    };
    const [toolCall] = await testApp.db
      .insert(testApp.schema.toolCalls)
      .values({
        agentStepId: step.id,
        toolName: 'run_command',
        arguments: proposedCommand,
        result: originalResult,
        status: 'pending',
      })
      .returning();
    if (!toolCall) throw new Error('toolCall não inserido');

    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${agentRun.id}/approve`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);
    expect(response.body.status).toBe('completed');

    const persisted = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${agentRun.id}`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);
    const persistedToolCall = persisted.body.steps
      .flatMap((s: { toolCalls: Array<{ id: string; status: string; result: Record<string, unknown> }> }) => s.toolCalls)
      .find((call: { id: string }) => call.id === toolCall.id);

    // Status flipa para "succeeded" (a decisão humana genérica), mas o
    // `result` continua EXATAMENTE o simulado gravado pelo orquestrador —
    // nenhuma execução real aconteceu (sem `exitCode`/`stdout`/`stderr`
    // reais, que é o que uma execução de verdade produziria).
    expect(persistedToolCall.status).toBe('succeeded');
    expect(persistedToolCall.result).toEqual(originalResult);
    expect(persistedToolCall.result.exitCode).toBeUndefined();
    expect(persistedToolCall.result.stdout).toBeUndefined();
  });
});
