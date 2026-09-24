import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

let testApp: TestApp;
let projectAId: string;
let projectBId: string;
let developerAToken: string;
let qaEngineerAToken: string;
let developerBToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Environments E2E', slug: 'org-a-environments-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Environments E2E', slug: 'org-b-environments-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);

  const [developerA, qaEngineerA, developerB] = await testApp.db
    .insert(testApp.schema.users)
    .values([
      {
        organizationId: organizationA.id,
        email: 'dev@org-a-environments-e2e-test.example',
        name: 'Dev A',
        role: 'developer',
        passwordHash,
      },
      {
        organizationId: organizationA.id,
        email: 'qa@org-a-environments-e2e-test.example',
        name: 'QA A',
        role: 'qa_engineer',
        passwordHash,
      },
      {
        organizationId: organizationB.id,
        email: 'dev@org-b-environments-e2e-test.example',
        name: 'Dev B',
        role: 'developer',
        passwordHash,
      },
    ])
    .returning();
  if (!developerA || !qaEngineerA || !developerB) throw new Error('users não inseridos');

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A', slug: 'project-a-environments-e2e-test' })
    .returning();
  const [projectB] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationB.id, name: 'Project B', slug: 'project-b-environments-e2e-test' })
    .returning();
  if (!projectA || !projectB) throw new Error('projects não inseridos');
  projectAId = projectA.id;
  projectBId = projectB.id;

  const [environmentA] = await testApp.db
    .insert(testApp.schema.environments)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      kind: 'production',
      name: 'Production',
      url: 'https://project-a.example',
      isProtected: true,
    })
    .returning();
  const [environmentB] = await testApp.db
    .insert(testApp.schema.environments)
    .values({
      organizationId: organizationB.id,
      projectId: projectB.id,
      kind: 'staging',
      name: 'Staging B',
      url: 'https://project-b.example',
      isProtected: false,
    })
    .returning();
  if (!environmentA || !environmentB) throw new Error('environments não inseridos');

  await testApp.db.insert(testApp.schema.deployments).values([
    {
      organizationId: organizationA.id,
      projectId: projectA.id,
      environmentId: environmentA.id,
      commitSha: 'abcdef123456',
      status: 'succeeded',
      startedAt: new Date('2026-09-24T00:00:00.000Z'),
      completedAt: new Date('2026-09-24T00:01:00.000Z'),
      deployedByUserId: developerA.id,
    },
    {
      organizationId: organizationB.id,
      projectId: projectB.id,
      environmentId: environmentB.id,
      commitSha: 'bbbbbb123456',
      status: 'failed',
      startedAt: new Date('2026-09-24T00:00:00.000Z'),
      completedAt: new Date('2026-09-24T00:02:00.000Z'),
      deployedByUserId: developerB.id,
    },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  developerAToken = await login('dev@org-a-environments-e2e-test.example');
  qaEngineerAToken = await login('qa@org-a-environments-e2e-test.example');
  developerBToken = await login('dev@org-b-environments-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /projects/:id/environments', () => {
  it('lista ambientes e deployments recentes do projeto da própria organização', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/environments`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('Production');
    expect(response.body[0].isProtected).toBe(true);
    expect(response.body[0].deployments).toHaveLength(1);
    expect(response.body[0].deployments[0].commitSha).toBe('abcdef123456');
    expect(response.body[0].deployments[0].deployedByUser).toEqual({
      id: expect.any(String),
      name: 'Dev A',
      email: 'dev@org-a-environments-e2e-test.example',
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('retorna 404 para projeto de outra organização, sem vazar existência', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectBId}/environments`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 403 para usuário sem project:read', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/environments`)
      .set('Authorization', `Bearer ${qaEngineerAToken}`)
      .expect(403);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get(`/projects/${projectAId}/environments`).expect(401);
  });

  it('retorna 404 para id malformado', async () => {
    await request(testApp.app.getHttpServer())
      .get('/projects/nao-e-uuid/environments')
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);
  });
});
