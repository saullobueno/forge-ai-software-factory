import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações + fixture real em disco, sem mocks) para
 * `POST /projects/:id/knowledge/reindex` (Fase 12, continuação — reindex sob
 * demanda com detecção real de staleness). `repositories.name` usa
 * `'acme-platform-web'`, o mesmo nome do fixture real em
 * `fixtures/acme-platform-web/` — o endpoint lê esse diretório de verdade
 * (via `RepositoryFsService`, a mesma infra que `code.e2e-spec.ts` já prova
 * funcionar), então as asserções abaixo conferem conteúdo/contagens reais,
 * nunca hardcoded.
 */
let testApp: TestApp;
let projectAId: string;
let projectBId: string;
let projectNoRepoId: string;
let techLeadAToken: string;
let developerAToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Knowledge Reindex E2E', slug: 'org-a-knowledge-reindex-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Knowledge Reindex E2E', slug: 'org-b-knowledge-reindex-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);

  await testApp.db.insert(testApp.schema.users).values([
    {
      organizationId: organizationA.id,
      email: 'tech-lead@org-a-knowledge-reindex-e2e-test.example',
      name: 'Tech Lead A',
      role: 'tech_lead',
      passwordHash,
    },
    {
      organizationId: organizationA.id,
      email: 'dev@org-a-knowledge-reindex-e2e-test.example',
      name: 'Dev A',
      role: 'developer',
      passwordHash,
    },
  ]);

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A', slug: 'project-a-knowledge-reindex-e2e-test' })
    .returning();
  const [projectB] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationB.id, name: 'Project B', slug: 'project-b-knowledge-reindex-e2e-test' })
    .returning();
  const [projectNoRepo] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project sem repo', slug: 'project-no-repo-knowledge-reindex-e2e-test' })
    .returning();
  if (!projectA || !projectB || !projectNoRepo) throw new Error('projects não inseridos');
  projectAId = projectA.id;
  projectBId = projectB.id;
  projectNoRepoId = projectNoRepo.id;

  await testApp.db.insert(testApp.schema.repositories).values({
    organizationId: organizationA.id,
    projectId: projectA.id,
    provider: 'mock',
    owner: 'acme-platform',
    // Mesmo nome do fixture real em `fixtures/acme-platform-web/` — o
    // endpoint lê esse diretório de verdade.
    name: 'acme-platform-web',
    defaultBranch: 'main',
  });

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  techLeadAToken = await login('tech-lead@org-a-knowledge-reindex-e2e-test.example');
  developerAToken = await login('dev@org-a-knowledge-reindex-e2e-test.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

describe('POST /projects/:id/knowledge/reindex', () => {
  it('indexa de verdade os arquivos reais do repositório (fixture em disco) e os documentos de organização do Forge', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/knowledge/reindex`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);

    expect(response.body.createdSources).toBeGreaterThan(0);
    expect(response.body.updatedSources).toBe(0);
    expect(response.body.unchangedSources).toBe(0);
    expect(response.body.totalSources).toBe(response.body.createdSources);

    const sources = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/knowledge`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);

    const uris = (sources.body as Array<{ uri: string }>).map((source) => source.uri);
    expect(uris).toContain('repo://acme-platform-web/README.md');
    expect(uris).toContain('repo://acme-platform-web/src/lib/format-currency.ts');
    expect(uris).toContain('forge://forge-ai-software-factory/docs/threat-model.md');

    const readmeSource = (sources.body as Array<{ uri: string; chunkCount: number }>).find(
      (source) => source.uri === 'repo://acme-platform-web/README.md',
    );
    expect(readmeSource?.chunkCount).toBeGreaterThan(0);
  });

  it('reindexar de novo sem nenhum arquivo real ter mudado não recria nem duplica nada — todas as fontes ficam "em dia"', async () => {
    const first = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/knowledge/reindex`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);
    const totalFromPreviousRun = first.body.totalSources as number;

    const second = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/knowledge/reindex`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);

    expect(second.body).toEqual({
      createdSources: 0,
      updatedSources: 0,
      unchangedSources: totalFromPreviousRun,
      totalSources: totalFromPreviousRun,
    });

    const sources = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/knowledge`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);
    expect(sources.body).toHaveLength(totalFromPreviousRun);
  });

  it('grava audit log knowledge.reindexed com as contagens reais', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/knowledge/reindex`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);

    const auditLogs = await request(testApp.app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);

    const reindexLog = (auditLogs.body as Array<{ action: string; targetId: string; metadata: Record<string, unknown> }>).find(
      (log) => log.action === 'knowledge.reindexed' && log.targetId === projectAId,
    );
    expect(reindexLog).toBeDefined();
    expect(reindexLog?.metadata).toMatchObject({ unchangedSources: expect.any(Number) });
  });

  it('degrada graciosamente para um projeto sem repositório configurado — só os documentos de organização são indexados', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectNoRepoId}/knowledge/reindex`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);

    // Os documentos de organização (`forge://...`) são compartilhados entre
    // TODOS os projetos da mesma organização (`projectId: null`) — pelos
    // testes anteriores já terem reindexado `projectA` (mesma organização),
    // essas fontes já existem e ficam "em dia" aqui, não "novas". O que este
    // teste prova é outro: um projeto SEM repositório configurado ainda
    // assim indexa de verdade os documentos de organização, sem tentar ler
    // nenhum arquivo de repositório (nenhuma fonte `repo://` aparece).
    expect(response.body.totalSources).toBeGreaterThan(0);
    expect(response.body.createdSources + response.body.updatedSources + response.body.unchangedSources).toBe(
      response.body.totalSources,
    );

    const sources = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectNoRepoId}/knowledge`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);
    const uris = (sources.body as Array<{ uri: string }>).map((source) => source.uri);
    expect(uris.length).toBeGreaterThan(0);
    expect(uris.every((uri) => uri.startsWith('forge://'))).toBe(true);
  });

  it('retorna 403 para quem não tem project:write', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/knowledge/reindex`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(403);
  });

  it('retorna 404 para projeto de outra organização, sem vazar existência', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectBId}/knowledge/reindex`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(404);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).post(`/projects/${projectAId}/knowledge/reindex`).expect(401);
  });

  it('retorna 404 para id malformado', async () => {
    // Precisa de um token com `project:write` — sem isso, o `PermissionsGuard`
    // já responde 403 ANTES do controller chegar a validar o formato do id
    // (mesmo raciocínio de `code.e2e-spec.ts`/`knowledge.e2e-spec.ts`: o
    // teste de "id malformado" isola a validação de formato, não a
    // permissão, então precisa de um ator autorizado).
    await request(testApp.app.getHttpServer())
      .post('/projects/nao-e-uuid/knowledge/reindex')
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(404);
  });
});
