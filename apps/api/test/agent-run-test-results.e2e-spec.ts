import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações + servidor HTTP real, sem mocks) para a
 * persistência do resultado REAL de `run_tests` (Fase 9 continuação): o
 * step `test_engineer` já chamava `run_tests` de verdade contra o fixture
 * em disco desde a Fase 7 (`executeRealTool`, leitura real dos arquivos de
 * teste — nenhum processo de teste roda, ver
 * `packages/agents/src/real-tool-runner.ts`), mas até aqui o resultado só
 * existia dentro de `toolCall.result`. Este teste roda o pipeline inteiro
 * (via `POST /tasks/:id/agent-runs` -> fila real -> `AgentRunOrchestrator`)
 * contra `fixtures/acme-platform-web/` e confirma que `test_runs`/
 * `test_suites`/`test_artifacts` (Fase 1) recebem uma linha real, cujos
 * números são comparados contra o `toolCall.result` que `executeRealTool`
 * de fato computou — nunca contra uma contagem fixada à parte.
 */
let testApp: TestApp;

let organizationId: string;
let developerToken: string;

const password = 'demo1234';
const REPOSITORY_NAME = 'acme-platform-web';

async function pollUntilTerminal(agentRunId: string, token: string): Promise<{
  status: string;
  steps: Array<{ role: string; toolCalls: Array<{ toolName: string; status: string; result: Record<string, unknown> | null }> }>;
  testRuns: Array<{
    id: string;
    status: string;
    durationMs: number | null;
    suites: Array<{ name: string; status: string; passedCount: number; failedCount: number; skippedCount: number }>;
    artifacts: Array<{ id: string; kind: string; name: string }>;
  }>;
}> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${agentRunId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    if (response.body.status === 'completed' || response.body.status === 'failed') {
      return response.body;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`agentRun ${agentRunId} não chegou a um status terminal a tempo`);
}

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org Test Results E2E', slug: 'org-test-results-e2e-test' })
    .returning();
  if (!organization) throw new Error('organization não inserida');
  organizationId = organization.id;

  const passwordHash = await hashPassword(password);
  const [developer] = await testApp.db
    .insert(testApp.schema.users)
    .values({
      organizationId,
      email: 'dev@test-results-e2e-test.example',
      name: 'Dev',
      role: 'developer',
      passwordHash,
    })
    .returning();
  if (!developer) throw new Error('developer não inserido');

  const login = await request(testApp.app.getHttpServer())
    .post('/auth/login')
    .send({ email: developer.email, password })
    .expect(200);
  developerToken = login.body.token as string;
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('run_tests real -> test_runs/test_suites persistidos', () => {
  it('persiste um testRun/testSuites reais e consistentes com o que executeRealTool computou', async () => {
    const [project] = await testApp.db
      .insert(testApp.schema.projects)
      .values({ organizationId, name: 'Project With Repo', slug: 'project-with-repo-test-results-e2e' })
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

    const [task] = await testApp.db
      .insert(testApp.schema.tasks)
      .values({ organizationId, projectId: project.id, title: 'Rodar suíte de testes' })
      .returning();
    if (!task) throw new Error('task não inserida');

    // Só o `test_engineer` está configurado — o resto do pipeline (planner,
    // code_explorer, implementer, documentation_agent, reviewer) roda como
    // "skipped" (`AgentRunOrchestrator` já cobre isso, Fase 7), sem propor
    // nenhuma tool call de escrita — assim a execução chega sozinha a
    // "completed" sem exigir aprovação humana, e o único fenômeno em jogo
    // é o `run_tests` real.
    const [agent] = await testApp.db
      .insert(testApp.schema.agents)
      .values({
        organizationId,
        role: 'test_engineer',
        name: 'Test Engineer',
        allowedTools: ['run_tests'],
      })
      .returning();
    if (!agent) throw new Error('agent não inserido');

    const createResponse = await request(testApp.app.getHttpServer())
      .post(`/tasks/${task.id}/agent-runs`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(201);
    const agentRunId = createResponse.body.id as string;

    const detail = await pollUntilTerminal(agentRunId, developerToken);
    expect(detail.status).toBe('completed');

    const testEngineerStep = detail.steps.find((step) => step.role === 'test_engineer');
    const runTestsCall = testEngineerStep?.toolCalls.find((call) => call.toolName === 'run_tests');
    expect(runTestsCall?.status).toBe('succeeded');
    const realResult = runTestsCall?.result as {
      suites: Array<{ name: string; passed: number; failed: number }>;
      totalPassed: number;
      totalFailed: number;
    };
    // O fixture `acme-platform-web` tem exatamente 2 arquivos `.test.ts`
    // (`format-currency.test.ts`, `invoice.test.ts`) — nenhum deles vazio.
    expect(realResult.suites.length).toBeGreaterThan(0);

    // --- A linha real em test_runs/test_suites precisa refletir EXATAMENTE
    // o que `executeRealTool` computou (comparado aqui, não hardcoded).
    expect(detail.testRuns).toHaveLength(1);
    const [testRun] = detail.testRuns;
    expect(testRun?.status).toBe(realResult.totalFailed > 0 ? 'failed' : 'passed');
    expect(testRun?.durationMs).toEqual(expect.any(Number));
    expect(testRun?.suites).toHaveLength(realResult.suites.length);

    for (const realSuite of realResult.suites) {
      const persistedSuite = testRun?.suites.find((suite) => suite.name === realSuite.name);
      expect(persistedSuite).toBeDefined();
      expect(persistedSuite?.passedCount).toBe(realSuite.passed);
      expect(persistedSuite?.failedCount).toBe(realSuite.failed);
      expect(persistedSuite?.skippedCount).toBe(0);
      expect(persistedSuite?.status).toBe(realSuite.failed > 0 ? 'failed' : 'passed');
    }

    // --- Reaproveita ArtifactStorageService (Fase 6) — um log real em
    // disco, listável e legível pelos mesmos endpoints já existentes.
    expect(testRun?.artifacts).toHaveLength(1);
    const [artifact] = testRun?.artifacts ?? [];
    expect(artifact?.kind).toBe('log');

    const artifactContent = await request(testApp.app.getHttpServer())
      .get(`/artifacts/${artifact?.id}/content`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(200);
    for (const realSuite of realResult.suites) {
      expect(artifactContent.body.content as string).toContain(realSuite.name);
    }

    // --- Também aparece na listagem genérica de artefatos da execução
    // (`GET /agent-runs/:id/artifacts`, Fase 6) — nenhum endpoint novo
    // precisou ser criado para isto.
    const artifactsList = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${agentRunId}/artifacts`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(200);
    expect((artifactsList.body as { id: string }[]).map((entry) => entry.id)).toContain(artifact?.id);
  }, 30_000);

  it('degrada graciosamente (nenhum testRun) quando o projeto não tem repositório configurado', async () => {
    const [project] = await testApp.db
      .insert(testApp.schema.projects)
      .values({ organizationId, name: 'Project Without Repo', slug: 'project-without-repo-test-results-e2e' })
      .returning();
    if (!project) throw new Error('project não inserido');

    const [task] = await testApp.db
      .insert(testApp.schema.tasks)
      .values({ organizationId, projectId: project.id, title: 'Tarefa sem repositório' })
      .returning();
    if (!task) throw new Error('task não inserida');

    const [agent] = await testApp.db
      .insert(testApp.schema.agents)
      .values({ organizationId, role: 'test_engineer', name: 'Test Engineer 2', allowedTools: ['run_tests'] })
      .returning();
    if (!agent) throw new Error('agent não inserido');

    const createResponse = await request(testApp.app.getHttpServer())
      .post(`/tasks/${task.id}/agent-runs`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(201);

    const detail = await pollUntilTerminal(createResponse.body.id as string, developerToken);
    expect(detail.status).toBe('completed');
    // Sem repositório -> `repositoryFiles: []` -> `run_tests` com
    // `paths: []` -> nenhuma suíte -> nada real para persistir (ver
    // `AgentRunOrchestrator.parseRunTestsResult`) — não uma linha vazia.
    expect(detail.testRuns).toEqual([]);
  }, 30_000);
});
