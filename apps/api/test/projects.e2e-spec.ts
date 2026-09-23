import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real contra banco real (PGlite + migrações aplicadas) — a prova
 * fim-a-fim de que `GET /projects/:id` nunca retorna um projeto de outra
 * organização (isolamento de tenant, spec Fase 2) e que `PermissionsGuard`
 * bloqueia um papel sem `project:read` (RBAC).
 */
let testApp: TestApp;
let projectAId: string;
let developerAToken: string;
let qaEngineerAToken: string;
let developerBToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A E2E', slug: 'org-a-projects-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B E2E', slug: 'org-b-projects-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);

  await testApp.db.insert(testApp.schema.users).values([
    {
      organizationId: organizationA.id,
      email: 'dev@org-a-projects-e2e-test.example',
      name: 'Dev A',
      role: 'developer',
      passwordHash,
    },
    {
      organizationId: organizationA.id,
      email: 'qa@org-a-projects-e2e-test.example',
      name: 'QA A',
      role: 'qa_engineer',
      passwordHash,
    },
    {
      organizationId: organizationB.id,
      email: 'dev@org-b-projects-e2e-test.example',
      name: 'Dev B',
      role: 'developer',
      passwordHash,
    },
  ]);

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({
      organizationId: organizationA.id,
      name: 'Project A',
      slug: 'project-a-e2e-test',
      description: 'Projeto da organização A',
    })
    .returning();
  if (!projectA) throw new Error('project não inserido');
  projectAId = projectA.id;

  // Dois projetos adicionais na organização A (inseridos em sequência, cada
  // um com `createdAt` estritamente maior que o anterior) para exercitar a
  // paginação keyset de `GET /projects` — sem isso só existiria 1 projeto,
  // insuficiente para testar cursor/nextCursor.
  await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A2', slug: 'project-a2-e2e-test' });
  await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A3', slug: 'project-a3-e2e-test' });

  await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationB.id, name: 'Project B', slug: 'project-b-e2e-test' });

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  developerAToken = await login('dev@org-a-projects-e2e-test.example');
  qaEngineerAToken = await login('qa@org-a-projects-e2e-test.example');
  developerBToken = await login('dev@org-b-projects-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /projects/:id', () => {
  it('retorna o projeto para um usuário da própria organização com project:read', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body.id).toBe(projectAId);
    expect(response.body.name).toBe('Project A');
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get(`/projects/${projectAId}`).expect(401);
  });

  it('retorna 404 (não 403) para um usuário autenticado de OUTRA organização — não vaza a existência do recurso', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}`)
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);

    expect(response.body.message).not.toMatch(/organiza/i);
  });

  it('retorna 404 para um id de projeto que não existe em nenhuma organização', async () => {
    await request(testApp.app.getHttpServer())
      .get('/projects/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 404 para um id malformado (não 400 — mesmo tratamento de "não encontrado")', async () => {
    await request(testApp.app.getHttpServer())
      .get('/projects/nao-e-um-uuid')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 403 para um usuário da organização certa mas sem a permissão project:read', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}`)
      .set('Authorization', `Bearer ${qaEngineerAToken}`)
      .expect(403);

    expect(response.body.message).toMatch(/permissão/i);
  });
});

describe('GET /projects', () => {
  it('lista só os projetos da própria organização, nunca de outra', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body.items).toHaveLength(3);
    expect(response.body.nextCursor).toBeNull();
    const names = response.body.items.map((project: { name: string }) => project.name).sort();
    expect(names).toEqual(['Project A', 'Project A2', 'Project A3']);
  });

  it('pagina por cursor sem repetir nem pular itens', async () => {
    const firstPage = await request(testApp.app.getHttpServer())
      .get('/projects?limit=2')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextCursor).not.toBeNull();

    const secondPage = await request(testApp.app.getHttpServer())
      .get(`/projects?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();

    const idsAcrossPages = [...firstPage.body.items, ...secondPage.body.items].map(
      (project: { id: string }) => project.id,
    );
    expect(new Set(idsAcrossPages).size).toBe(3);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/projects').expect(401);
  });

  it('retorna 403 para um usuário sem project:read', async () => {
    await request(testApp.app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${qaEngineerAToken}`)
      .expect(403);
  });
});
