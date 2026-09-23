import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações + fixture real em disco, sem mocks) para o
 * `CodeModule` da Fase 5 (spec §10 — "Inteligência de código"):
 * árvore/arquivo/busca/diff do repositório. O `repositories` de teste usa
 * `name: 'acme-platform-web'`, o mesmo nome do fixture real em
 * `fixtures/acme-platform-web/` — os endpoints leem esse diretório de
 * verdade (não um mock em memória), então as asserções abaixo conferem
 * conteúdo real do fixture.
 *
 * O teste mais importante aqui é o de path traversal (`GET .../file`) —
 * prova que `RepositoryFsService.resolveWithinRoot` nunca deixa um `path`
 * escapar do diretório do repositório demo, mesmo quando o alvo (ex.:
 * `apps/api/package.json`) existe de verdade em disco fora do fixture.
 */
let testApp: TestApp;
let projectAId: string;
let projectNoRepoId: string;
let developerAToken: string;
let qaEngineerAToken: string;
let developerBToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Code E2E', slug: 'org-a-code-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Code E2E', slug: 'org-b-code-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);

  await testApp.db.insert(testApp.schema.users).values([
    {
      organizationId: organizationA.id,
      email: 'dev@org-a-code-e2e-test.example',
      name: 'Dev A',
      role: 'developer',
      passwordHash,
    },
    {
      organizationId: organizationA.id,
      email: 'qa@org-a-code-e2e-test.example',
      name: 'QA A',
      role: 'qa_engineer',
      passwordHash,
    },
    {
      organizationId: organizationB.id,
      email: 'dev@org-b-code-e2e-test.example',
      name: 'Dev B',
      role: 'developer',
      passwordHash,
    },
  ]);

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A', slug: 'project-a-code-e2e-test' })
    .returning();
  const [projectB] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationB.id, name: 'Project B', slug: 'project-b-code-e2e-test' })
    .returning();
  const [projectNoRepo] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project sem repo', slug: 'project-no-repo-code-e2e-test' })
    .returning();
  if (!projectA || !projectB || !projectNoRepo) throw new Error('projects não inseridos');
  projectAId = projectA.id;
  projectNoRepoId = projectNoRepo.id;

  const [repositoryA] = await testApp.db
    .insert(testApp.schema.repositories)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      provider: 'mock',
      owner: 'acme-platform',
      // Mesmo nome do fixture real em `fixtures/acme-platform-web/` — os
      // endpoints leem esse diretório de verdade.
      name: 'acme-platform-web',
      defaultBranch: 'main',
    })
    .returning();
  if (!repositoryA) throw new Error('repository não inserido');

  const [workspaceA] = await testApp.db
    .insert(testApp.schema.workspaces)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      repositoryId: repositoryA.id,
      branchName: 'fix/code-e2e-test',
      status: 'archived',
    })
    .returning();
  if (!workspaceA) throw new Error('workspace não inserido');

  const [codeChangeA] = await testApp.db
    .insert(testApp.schema.codeChanges)
    .values({
      organizationId: organizationA.id,
      workspaceId: workspaceA.id,
      filePath: 'src/lib/format-currency.ts',
      changeType: 'modified',
    })
    .returning();
  if (!codeChangeA) throw new Error('codeChange não inserido');

  await testApp.db.insert(testApp.schema.diffs).values({
    organizationId: organizationA.id,
    codeChangeId: codeChangeA.id,
    patch: '--- a/src/lib/format-currency.ts\n+++ b/src/lib/format-currency.ts\n@@ -1 +1 @@\n-old\n+new\n',
    additions: 1,
    deletions: 1,
  });

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  developerAToken = await login('dev@org-a-code-e2e-test.example');
  qaEngineerAToken = await login('qa@org-a-code-e2e-test.example');
  developerBToken = await login('dev@org-b-code-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /projects/:id/repository/tree', () => {
  it('retorna a árvore real do fixture em disco para um usuário da própria organização', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/tree`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    const names = (response.body as { name: string; type: string }[]).map((node) => node.name).sort();
    expect(names).toContain('src');
    expect(names).toContain('package.json');
    // `.snapshots/` guarda a versão "antes" do bug, usada só pelo seed do
    // banco (packages/database/src/seed/fixtures.ts) — não é um arquivo do
    // repositório de verdade, por isso a árvore não deve listá-la (mesma
    // regra de dotfiles/dotdirs aplicada a `.git`).
    expect(names).not.toContain('.snapshots');

    const src = (response.body as { name: string; type: string; children?: unknown[] }[]).find(
      (node) => node.name === 'src',
    );
    expect(src?.type).toBe('directory');
    expect(src?.children).toBeDefined();
  });

  it('retorna 404 (não 403) para um projeto de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/tree`)
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);
  });

  it('retorna 403 para um usuário da organização certa sem project:read', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/tree`)
      .set('Authorization', `Bearer ${qaEngineerAToken}`)
      .expect(403);
  });

  it('retorna 404 para um projeto sem repositório associado', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectNoRepoId}/repository/tree`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });
});

describe('GET /projects/:id/repository/file', () => {
  it('retorna conteúdo real, metadados e símbolos top-level para um arquivo .ts', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/file`)
      .query({ path: 'src/lib/format-currency.ts' })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body.path).toBe('src/lib/format-currency.ts');
    expect(response.body.language).toBe('typescript');
    expect(response.body.content).toContain('export function formatCurrency');
    expect(response.body.sizeBytes).toBeGreaterThan(0);

    const symbolNames = (response.body.symbols as { name: string; kind: string }[]).map((s) => s.name);
    expect(symbolNames).toContain('formatCurrency');
    expect(symbolNames).toContain('SupportedCurrency');
  });

  it('retorna 404 para um arquivo que não existe no repositório', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/file`)
      .query({ path: 'src/lib/does-not-exist.ts' })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 400 sem o parâmetro "path"', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/file`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(400);
  });

  it('rejeita path traversal com 404 genérico, mesmo apontando para um arquivo que existe de verdade fora do fixture', async () => {
    // `apps/api/package.json` existe de verdade no disco (é o package.json
    // real desta própria API) — a prova de que o traversal é bloqueado é
    // justamente não vazar isso: precisa responder 404 igual a um arquivo
    // inexistente, nunca 200 com o conteúdo de fora do repositório demo.
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/file`)
      .query({ path: '../../../../../apps/api/package.json' })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);

    expect(response.body.message).not.toMatch(/package\.json/i);
  });

  it('rejeita path traversal com barra invertida (variante Windows) também com 404', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/file`)
      .query({ path: '..\\..\\..\\..\\..\\apps\\api\\package.json' })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 404 (não 403) para um projeto de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/file`)
      .query({ path: 'src/lib/format-currency.ts' })
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);
  });
});

describe('GET /projects/:id/repository/search', () => {
  it('encontra o arquivo pelo conteúdo (substring simples, case-insensitive)', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/search`)
      .query({ q: 'formatcurrency' })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    const paths = (response.body as { path: string; matchedInContent: boolean }[]).map((r) => r.path);
    expect(paths).toContain('src/lib/format-currency.ts');
    expect(paths).toContain('src/index.ts');
  });

  it('encontra o arquivo pelo nome', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/search`)
      .query({ q: 'invoice' })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    const paths = (response.body as { path: string; matchedInName: boolean }[]).map((r) => r.path);
    expect(paths).toContain('src/lib/invoice.ts');
  });

  it('retorna 400 sem o parâmetro "q"', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/search`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(400);
  });
});

describe('GET /projects/:id/repository/diff', () => {
  it('retorna o diff real seedado para o projeto', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/diff`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].filePath).toBe('src/lib/format-currency.ts');
    expect(response.body[0].changeType).toBe('modified');
    expect(response.body[0].additions).toBe(1);
    expect(response.body[0].deletions).toBe(1);
    expect(response.body[0].patch).toContain('format-currency.ts');
  });

  it('retorna 404 (não 403) para um projeto de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/repository/diff`)
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);
  });

  it('retorna lista vazia para um projeto sem nenhum code change', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectNoRepoId}/repository/diff`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });
});
