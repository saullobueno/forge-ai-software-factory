import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

let testApp: TestApp;
let projectAId: string;
let projectBId: string;
let protectedEnvironmentAId: string;
let openEnvironmentAId: string;
let environmentBId: string;
let developerAToken: string;
let platformEngineerAToken: string;
let qaEngineerAToken: string;
let adminAToken: string;
let developerBToken: string;

const password = 'demo1234';

interface EnvironmentResponse {
  name: string;
  isProtected: boolean;
  deployments: Array<{
    commitSha: string;
    latestApproval: unknown;
    deployedByUser: unknown;
  }>;
}

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

  const [developerA, platformEngineerA, qaEngineerA, adminA, developerB] = await testApp.db
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
        email: 'platform@org-a-environments-e2e-test.example',
        name: 'Platform A',
        role: 'platform_engineer',
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
        organizationId: organizationA.id,
        email: 'admin@org-a-environments-e2e-test.example',
        name: 'Admin A',
        role: 'admin',
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
  if (!developerA || !platformEngineerA || !qaEngineerA || !adminA || !developerB) throw new Error('users não inseridos');

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

  const [environmentA, openEnvironmentA] = await testApp.db
    .insert(testApp.schema.environments)
    .values([
      {
        organizationId: organizationA.id,
        projectId: projectA.id,
        kind: 'production',
        name: 'Production',
        url: 'https://project-a.example',
        isProtected: true,
      },
      {
        organizationId: organizationA.id,
        projectId: projectA.id,
        kind: 'preview',
        name: 'Preview',
        url: 'https://preview.project-a.example',
        isProtected: false,
      },
    ])
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
  if (!environmentA || !openEnvironmentA || !environmentB) throw new Error('environments não inseridos');
  protectedEnvironmentAId = environmentA.id;
  openEnvironmentAId = openEnvironmentA.id;
  environmentBId = environmentB.id;

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
  platformEngineerAToken = await login('platform@org-a-environments-e2e-test.example');
  qaEngineerAToken = await login('qa@org-a-environments-e2e-test.example');
  adminAToken = await login('admin@org-a-environments-e2e-test.example');
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

    expect(response.body).toHaveLength(2);
    const production = (response.body as EnvironmentResponse[]).find((environment) => environment.name === 'Production');
    if (!production) throw new Error('Production não retornado');
    expect(production.isProtected).toBe(true);
    expect(production.deployments).toHaveLength(1);
    expect(production.deployments[0].commitSha).toBe('abcdef123456');
    expect(production.deployments[0].latestApproval).toBeNull();
    expect(production.deployments[0].deployedByUser).toEqual({
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

  it('solicita deployment em ambiente aberto e conclui a demo imediatamente', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${openEnvironmentAId}/deployments`)
      .set('Authorization', `Bearer ${platformEngineerAToken}`)
      .send({ commitSha: 'feedface1234' })
      .expect(201);

    expect(response.body.status).toBe('succeeded');
    expect(response.body.commitSha).toBe('feedface1234');
    expect(response.body.completedAt).toEqual(expect.any(String));
    expect(response.body.latestApproval).toBeNull();

    const auditLogs = await testApp.db.query.auditLogs.findMany({
      where: (auditLogs, { and, eq }) =>
        and(eq(auditLogs.targetType, 'deployment'), eq(auditLogs.targetId, response.body.id)),
    });
    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual(
      expect.arrayContaining(['deployment.requested', 'deployment.succeeded']),
    );
  });

  it('solicita deployment em ambiente protegido e cria approval pendente', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments`)
      .set('Authorization', `Bearer ${platformEngineerAToken}`)
      .send({ commitSha: 'cafebabe1234' })
      .expect(201);

    expect(response.body.status).toBe('queued');
    expect(response.body.startedAt).toBeNull();
    expect(response.body.completedAt).toBeNull();
    expect(response.body.latestApproval).toMatchObject({
      status: 'pending',
      requestedByUserId: expect.any(String),
      approvedByUserId: null,
    });

    const approval = await testApp.db.query.approvals.findFirst({
      where: (approvals, { and, eq }) =>
        and(eq(approvals.subjectType, 'deployment'), eq(approvals.subjectId, response.body.id)),
    });
    expect(approval?.status).toBe('pending');
  });

  it('retorna 403 para usuário sem environment:deploy', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${openEnvironmentAId}/deployments`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .send({ commitSha: 'feedface9999' })
      .expect(403);
  });

  it('retorna 404 ao tentar deploy em ambiente de outra organização', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectBId}/environments/${environmentBId}/deployments`)
      .set('Authorization', `Bearer ${platformEngineerAToken}`)
      .send({ commitSha: 'feedface9999' })
      .expect(404);
  });
});

/**
 * Decisão humana sobre o gate de deploy protegido (spec §13), mesmo padrão
 * de `agent-runs.e2e-spec.ts` approve/reject: 200 em sucesso, 409 fora do
 * estado esperado, 403 sem a permissão de decisão, 404 genérico
 * cross-tenant. `environment:approve_deployment` é restrita só a `admin`
 * (ver `packages/domain/src/permissions.ts`) — inclusive `platformEngineerA`,
 * que PODE solicitar (`environment:deploy`), não pode decidir o próprio
 * pedido.
 */
describe('POST /projects/:id/environments/:environmentId/deployments/:deploymentId/approve|reject', () => {
  async function requestProtectedDeployment(commitSha: string): Promise<string> {
    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments`)
      .set('Authorization', `Bearer ${platformEngineerAToken}`)
      .send({ commitSha })
      .expect(201);
    return response.body.id as string;
  }

  it('aprova um deployment protegido pendente e conclui como succeeded', async () => {
    const deploymentId = await requestProtectedDeployment('deadbeef0001');

    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments/${deploymentId}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({})
      .expect(200);

    expect(response.body.status).toBe('succeeded');
    expect(response.body.completedAt).toEqual(expect.any(String));
    expect(response.body.latestApproval).toMatchObject({
      status: 'approved',
      approvedByUserId: expect.any(String),
    });

    const deploymentRow = await testApp.db.query.deployments.findFirst({
      where: (deployments, { eq }) => eq(deployments.id, deploymentId),
    });
    expect(deploymentRow?.status).toBe('succeeded');

    const auditLogs = await testApp.db.query.auditLogs.findMany({
      where: (auditLogs, { and, eq }) => and(eq(auditLogs.targetType, 'deployment'), eq(auditLogs.targetId, deploymentId)),
    });
    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual(expect.arrayContaining(['deployment.approved']));
  });

  it('rejeita um deployment protegido pendente e conclui como failed', async () => {
    const deploymentId = await requestProtectedDeployment('deadbeef0002');

    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments/${deploymentId}/reject`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ reason: 'Commit ainda não passou por revisão de segurança.' })
      .expect(200);

    expect(response.body.status).toBe('failed');
    expect(response.body.latestApproval).toMatchObject({
      status: 'rejected',
      approvedByUserId: expect.any(String),
      reason: 'Commit ainda não passou por revisão de segurança.',
    });

    const auditLogs = await testApp.db.query.auditLogs.findMany({
      where: (auditLogs, { and, eq }) => and(eq(auditLogs.targetType, 'deployment'), eq(auditLogs.targetId, deploymentId)),
    });
    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual(expect.arrayContaining(['deployment.rejected']));
  });

  it('retorna 409 ao tentar decidir um deployment que não está mais queued', async () => {
    const deploymentId = await requestProtectedDeployment('deadbeef0003');

    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments/${deploymentId}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({})
      .expect(200);

    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments/${deploymentId}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({})
      .expect(409);
  });

  it('retorna 409 ao tentar decidir um deployment de ambiente não-protegido (nunca teve approval pendente)', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${openEnvironmentAId}/deployments`)
      .set('Authorization', `Bearer ${platformEngineerAToken}`)
      .send({ commitSha: 'deadbeef0004' })
      .expect(201);

    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${openEnvironmentAId}/deployments/${response.body.id}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({})
      .expect(409);
  });

  it('retorna 403 para quem só pode solicitar deploy (environment:deploy), não decidir', async () => {
    const deploymentId = await requestProtectedDeployment('deadbeef0005');

    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments/${deploymentId}/approve`)
      .set('Authorization', `Bearer ${platformEngineerAToken}`)
      .send({})
      .expect(403);
  });

  it('retorna 403 sem nenhuma permissão de deploy', async () => {
    const deploymentId = await requestProtectedDeployment('deadbeef0006');

    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments/${deploymentId}/reject`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .send({})
      .expect(403);
  });

  it('retorna 404 genérico ao tentar decidir um deployment de outra organização', async () => {
    const deploymentId = await requestProtectedDeployment('deadbeef0007');

    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectBId}/environments/${environmentBId}/deployments/${deploymentId}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({})
      .expect(404);
  });

  it('retorna 404 para deploymentId malformado', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/projects/${projectAId}/environments/${protectedEnvironmentAId}/deployments/nao-e-uuid/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({})
      .expect(404);
  });
});
