import { hashPassword } from '@forge/domain';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações + servidor HTTP real ouvindo em porta
 * efêmera, sem mocks) para a Fase 6 — "Execuções de IA" (spec §9):
 * `GET /tasks/:id/agent-runs`, `GET /agent-runs/:id` (com steps + tool
 * calls), `POST /agent-runs/:id/cancel` (transição de estado real via
 * `@forge/domain`, nunca uma simulação), o canal SSE
 * `GET /agent-runs/:id/events`, e os artefatos
 * (`GET /agent-runs/:id/artifacts` + `GET /artifacts/:id/content`,
 * incluindo o mesmo teste de path traversal usado para o `CodeModule`).
 *
 * O app sobe ouvindo uma porta real (`testApp.app.listen(0)`) — não só
 * `app.init()` como os outros specs e2e — porque o teste de SSE precisa de
 * duas conexões HTTP concorrentes contra o mesmo servidor (a conexão SSE
 * aberta + a chamada de cancelamento que dispara o evento nela).
 */
let testApp: TestApp;
let apiPort: number;

let organizationAId: string;
let taskAId: string;
let taskBId: string;
let agentAId: string;

let developerAToken: string;
let qaEngineerAToken: string;
let productManagerAToken: string;
let developerBToken: string;
let qaEngineerAId: string;

let runQueuedId: string;
let runCompletedId: string;
let runOrgBId: string;

let artifactContentId: string;
let artifactTraversalId: string;
let artifactOrgBId: string;

const password = 'demo1234';

// `apps/api/test/agent-runs.e2e-spec.ts` -> `apps/api` -> `apps` -> raiz do
// monorepo: 3 níveis, mesmo `.data/artifacts/` lido por
// `ArtifactStorageService` (ver `apps/api/src/modules/artifacts/artifact-storage.service.ts`,
// que calcula a mesma raiz a partir da própria profundidade em disco).
const currentDir = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_ROOT = join(currentDir, '..', '..', '..', '.data', 'artifacts');
const ARTIFACT_CONTENT_RELATIVE_PATH = 'agent-runs-e2e-test/vitest-run.log';
const ARTIFACT_CONTENT = 'PASS agent-runs e2e artifact content test\n1 passed\n';

/**
 * Lê o corpo de uma resposta SSE bruta (fora do supertest — supertest
 * bloquearia até a conexão fechar, e uma conexão SSE fica aberta de
 * propósito) e resolve cada `data:` recebido como um item de
 * `receivedStatuses`. `waitForCount(n)` deixa o teste sincronizar com o
 * servidor sem `sleep`: primeiro espera o evento inicial (prova que a
 * inscrição no canal já aconteceu) antes de disparar a ação que deveria
 * gerar o segundo evento.
 */
function createSseListener(path: string, token: string) {
  const receivedStatuses: string[] = [];
  const waiters: Array<() => void> = [];
  let buffer = '';

  const req = httpRequest(
    {
      host: '127.0.0.1',
      port: apiPort,
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
    (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice('data: '.length)) as { status: string };
          receivedStatuses.push(payload.status);
          waiters.splice(0).forEach((resolve) => resolve());
        }
      });
    },
  );
  req.end();

  async function waitForCount(count: number, timeoutMs = 10_000): Promise<string[]> {
    if (receivedStatuses.length >= count) return receivedStatuses.slice(0, count);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout esperando eventos SSE.')), timeoutMs);
      const check = () => {
        if (receivedStatuses.length >= count) {
          clearTimeout(timer);
          resolve(receivedStatuses.slice(0, count));
        } else {
          waiters.push(check);
        }
      };
      check();
    });
  }

  return { waitForCount, destroy: () => req.destroy() };
}

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const server = await testApp.app.listen(0);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste não ouviu em uma porta TCP.');
  apiPort = address.port;

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A AgentRuns E2E', slug: 'org-a-agent-runs-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B AgentRuns E2E', slug: 'org-b-agent-runs-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');
  organizationAId = organizationA.id;

  const passwordHash = await hashPassword(password);
  const users = await testApp.db.insert(testApp.schema.users).values([
    {
      organizationId: organizationA.id,
      email: 'dev@org-a-agent-runs-e2e-test.example',
      name: 'Dev A',
      role: 'developer',
      passwordHash,
    },
    {
      organizationId: organizationA.id,
      email: 'qa@org-a-agent-runs-e2e-test.example',
      name: 'QA A',
      role: 'qa_engineer',
      passwordHash,
    },
    {
      organizationId: organizationA.id,
      email: 'pm@org-a-agent-runs-e2e-test.example',
      name: 'PM A',
      role: 'product_manager',
      passwordHash,
    },
    {
      organizationId: organizationB.id,
      email: 'dev@org-b-agent-runs-e2e-test.example',
      name: 'Dev B',
      role: 'developer',
      passwordHash,
    },
  ]).returning();
  const qaEngineerA = users.find((user) => user.email === 'qa@org-a-agent-runs-e2e-test.example');
  if (!qaEngineerA) throw new Error('qa engineer A não inserido');
  qaEngineerAId = qaEngineerA.id;

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A', slug: 'project-a-agent-runs-e2e-test' })
    .returning();
  const [projectB] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationB.id, name: 'Project B', slug: 'project-b-agent-runs-e2e-test' })
    .returning();
  if (!projectA || !projectB) throw new Error('projects não inseridos');

  const [taskA] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({ organizationId: organizationA.id, projectId: projectA.id, title: 'Tarefa A' })
    .returning();
  const [taskB] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({ organizationId: organizationB.id, projectId: projectB.id, title: 'Tarefa B' })
    .returning();
  if (!taskA || !taskB) throw new Error('tasks não inseridas');
  taskAId = taskA.id;
  taskBId = taskB.id;

  const [agentA] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId: organizationA.id, role: 'planner', name: 'Planner A' })
    .returning();
  const [agentB] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId: organizationB.id, role: 'planner', name: 'Planner B' })
    .returning();
  if (!agentA || !agentB) throw new Error('agents não inseridos');
  agentAId = agentA.id;

  const [runQueued] = await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({
      organizationId: organizationA.id,
      taskId: taskA.id,
      agentId: agentA.id,
      status: 'queued',
      objective: 'Execução em fila para teste de cancelamento/SSE',
    })
    .returning();
  const [runCompleted] = await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({
      organizationId: organizationA.id,
      taskId: taskA.id,
      agentId: agentA.id,
      status: 'completed',
      objective: 'Execução concluída para teste de detalhe/409',
      totalTokens: 500,
      totalCostUsd: '0.001500',
    })
    .returning();
  const [runOrgB] = await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({
      organizationId: organizationB.id,
      taskId: taskB.id,
      agentId: agentB.id,
      status: 'queued',
      objective: 'Execução de outra organização',
    })
    .returning();
  if (!runQueued || !runCompleted || !runOrgB) throw new Error('agentRuns não inseridos');
  runQueuedId = runQueued.id;
  runCompletedId = runCompleted.id;
  runOrgBId = runOrgB.id;

  const [reviewerStep] = await testApp.db
    .insert(testApp.schema.agentSteps)
    .values({
      agentRunId: runCompleted.id,
      name: 'Revisar diff',
      role: 'reviewer',
      status: 'succeeded',
      input: { codeChangeId: 'fake' },
      output: { verdict: 'approve', findings: [{ id: 'f1', severity: 'info' }] },
      durationMs: 1_000,
      tokens: 200,
      costUsd: '0.000600',
    })
    .returning();
  if (!reviewerStep) throw new Error('agentStep não inserido');

  await testApp.db.insert(testApp.schema.toolCalls).values({
    agentStepId: reviewerStep.id,
    toolName: 'inspect_diff',
    arguments: { codeChangeId: 'fake' },
    result: { additions: 1, deletions: 1 },
    status: 'succeeded',
  });

  const [testRun] = await testApp.db
    .insert(testApp.schema.testRuns)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      agentRunId: runCompleted.id,
      status: 'passed',
    })
    .returning();
  const [testRunOrgB] = await testApp.db
    .insert(testApp.schema.testRuns)
    .values({
      organizationId: organizationB.id,
      projectId: projectB.id,
      agentRunId: runOrgB.id,
      status: 'passed',
    })
    .returning();
  if (!testRun || !testRunOrgB) throw new Error('testRuns não inseridos');

  const [artifactContent] = await testApp.db
    .insert(testApp.schema.testArtifacts)
    .values({
      testRunId: testRun.id,
      kind: 'log',
      name: 'vitest-run.log',
      storageKey: ARTIFACT_CONTENT_RELATIVE_PATH,
      sizeBytes: Buffer.byteLength(ARTIFACT_CONTENT, 'utf8'),
    })
    .returning();
  const [artifactTraversal] = await testApp.db
    .insert(testApp.schema.testArtifacts)
    .values({
      testRunId: testRun.id,
      kind: 'log',
      name: 'traversal.log',
      // Mesmo golpe de path traversal testado em `code.e2e-spec.ts` — aponta
      // para um arquivo que existe de verdade fora de `ARTIFACTS_ROOT`
      // (`apps/api/package.json`, real neste próprio repositório).
      storageKey: '../../../../apps/api/package.json',
      sizeBytes: 10,
    })
    .returning();
  const [artifactOrgB] = await testApp.db
    .insert(testApp.schema.testArtifacts)
    .values({
      testRunId: testRunOrgB.id,
      kind: 'log',
      name: 'org-b.log',
      storageKey: 'org-b-e2e-test/does-not-need-to-exist.log',
      sizeBytes: 10,
    })
    .returning();
  if (!artifactContent || !artifactTraversal || !artifactOrgB) throw new Error('testArtifacts não inseridos');
  artifactContentId = artifactContent.id;
  artifactTraversalId = artifactTraversal.id;
  artifactOrgBId = artifactOrgB.id;

  await mkdir(join(ARTIFACTS_ROOT, dirname(ARTIFACT_CONTENT_RELATIVE_PATH)), { recursive: true });
  await writeFile(join(ARTIFACTS_ROOT, ARTIFACT_CONTENT_RELATIVE_PATH), ARTIFACT_CONTENT, 'utf8');

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  developerAToken = await login('dev@org-a-agent-runs-e2e-test.example');
  qaEngineerAToken = await login('qa@org-a-agent-runs-e2e-test.example');
  productManagerAToken = await login('pm@org-a-agent-runs-e2e-test.example');
  developerBToken = await login('dev@org-b-agent-runs-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await rm(join(ARTIFACTS_ROOT, 'agent-runs-e2e-test'), { recursive: true, force: true });
  await testApp.cleanup();
});

describe('GET /tasks/:id/agent-runs', () => {
  it('lista as execuções da tarefa, mais recentes primeiro', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/tasks/${taskAId}/agent-runs`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    const ids = (response.body as { id: string }[]).map((run) => run.id);
    expect(ids).toEqual(expect.arrayContaining([runQueuedId, runCompletedId]));
    expect(ids).not.toContain(runOrgBId);
  });

  it('retorna 404 (não 403) para uma tarefa de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/tasks/${taskBId}/agent-runs`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });
});

describe('GET /agent-runs/:id', () => {
  it('retorna a execução com steps ordenados e tool calls de cada step', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${runCompletedId}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body.id).toBe(runCompletedId);
    expect(response.body.status).toBe('completed');
    expect(response.body.steps).toHaveLength(1);
    expect(response.body.steps[0].role).toBe('reviewer');
    expect(response.body.steps[0].output.findings).toHaveLength(1);
    expect(response.body.steps[0].toolCalls).toHaveLength(1);
    expect(response.body.steps[0].toolCalls[0].toolName).toBe('inspect_diff');
  });

  it('retorna 404 (não 403) para uma execução de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${runOrgBId}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 404 para um id que não existe em nenhuma organização', async () => {
    await request(testApp.app.getHttpServer())
      .get('/agent-runs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });
});

describe('POST /agent-runs/:id/cancel', () => {
  it('retorna 403 para um usuário sem agent_run:cancel', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${runQueuedId}/cancel`)
      .set('Authorization', `Bearer ${productManagerAToken}`)
      .expect(403);

    expect(response.body.message).toMatch(/permissão/i);
  });

  it('retorna 404 para uma execução de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${runOrgBId}/cancel`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 409 ao tentar cancelar uma execução já em status terminal ("completed")', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${runCompletedId}/cancel`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(409);

    expect(response.body.message).toContain('completed');
  });

  it('cancela uma execução em "queued" (transição de estado real via @forge/domain) e persiste o novo status', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${runQueuedId}/cancel`)
      .set('Authorization', `Bearer ${qaEngineerAToken}`)
      .expect(200);

    expect(response.body.status).toBe('cancelled');

    const persisted = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${runQueuedId}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);
    expect(persisted.body.status).toBe('cancelled');

    const { and, eq } = await import('@forge/database');
    const [auditLog] = await testApp.db.query.auditLogs.findMany({
      where: and(
        eq(testApp.schema.auditLogs.action, 'agent_run.cancelled'),
        eq(testApp.schema.auditLogs.targetId, runQueuedId),
      ),
      limit: 1,
    });
    expect(auditLog).toMatchObject({
      organizationId: organizationAId,
      actorType: 'user',
      actorUserId: qaEngineerAId,
      action: 'agent_run.cancelled',
      targetType: 'agent_run',
      targetId: runQueuedId,
    });
    expect(auditLog?.metadata).toMatchObject({
      previousStatus: 'queued',
      status: 'cancelled',
      taskId: taskAId,
    });

    // Já terminal agora — uma segunda tentativa de cancelamento é 409, não
    // um segundo 200 silencioso.
    await request(testApp.app.getHttpServer())
      .post(`/agent-runs/${runQueuedId}/cancel`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(409);
  });
});

describe('GET /agent-runs/:id/events (SSE)', () => {
  it('emite o status atual na conexão e, na sequência, o novo status quando a execução é cancelada por outra chamada', async () => {
    const [runForSse] = await testApp.db
      .insert(testApp.schema.agentRuns)
      .values({
        organizationId: organizationAId,
        taskId: taskAId,
        agentId: agentAId,
        status: 'queued',
        objective: 'Execução para teste de SSE',
      })
      .returning();
    if (!runForSse) throw new Error('agentRun de SSE não inserido');

    const listener = createSseListener(`/agent-runs/${runForSse.id}/events`, developerAToken);
    try {
      // Espera o snapshot inicial primeiro — prova que a conexão já está
      // inscrita no canal ANTES de disparar o cancelamento, eliminando a
      // corrida entre "abrir a conexão" e "publicar o evento".
      const [initialStatus] = await listener.waitForCount(1);
      expect(initialStatus).toBe('queued');

      await request(testApp.app.getHttpServer())
        .post(`/agent-runs/${runForSse.id}/cancel`)
        .set('Authorization', `Bearer ${developerAToken}`)
        .expect(200);

      const [, secondStatus] = await listener.waitForCount(2);
      expect(secondStatus).toBe('cancelled');
    } finally {
      listener.destroy();
    }
  });

  it('retorna 404 para uma execução de OUTRA organização antes de qualquer emissão', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${runOrgBId}/events`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });
});

describe('GET /agent-runs/:id/artifacts', () => {
  it('lista os artefatos dos testRuns ligados à execução', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${runCompletedId}/artifacts`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    const ids = (response.body as { id: string }[]).map((artifact) => artifact.id);
    expect(ids).toEqual(expect.arrayContaining([artifactContentId, artifactTraversalId]));
  });

  it('retorna 404 (não 403) para uma execução de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${runOrgBId}/artifacts`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });
});

describe('GET /artifacts/:id/content', () => {
  it('retorna o conteúdo real do arquivo em disco', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/artifacts/${artifactContentId}/content`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body.content).toBe(ARTIFACT_CONTENT);
    expect(response.body.sizeBytes).toBe(Buffer.byteLength(ARTIFACT_CONTENT, 'utf8'));
  });

  it('rejeita path traversal com 404 genérico, mesmo apontando para um arquivo que existe de verdade fora de ARTIFACTS_ROOT', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/artifacts/${artifactTraversalId}/content`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);

    expect(response.body.message).not.toMatch(/package\.json/i);
  });

  it('retorna 404 (não 403) para um artefato de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/artifacts/${artifactOrgBId}/content`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('um usuário da própria organização do artefato recebe 404 de storage (arquivo nunca foi escrito), não um 200 vazio', async () => {
    // `artifactOrgBId` existe no banco (organização B) mas nunca teve
    // bytes reais gravados em `ARTIFACTS_ROOT` — prova que a checagem de
    // tenant (linha acima, dev A) e a leitura real em disco (aqui, dev B)
    // são caminhos distintos: o registro no banco não é suficiente sozinho
    // para responder 200.
    await request(testApp.app.getHttpServer())
      .get(`/artifacts/${artifactOrgBId}/content`)
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);
  });

  it('retorna 404 para um id que não existe em nenhuma organização', async () => {
    await request(testApp.app.getHttpServer())
      .get('/artifacts/00000000-0000-0000-0000-000000000000/content')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });
});
