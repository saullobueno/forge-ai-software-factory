import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) do "Resetar demo": só o admin de uma conta de
 * demonstração pode chamar; remove o que visitantes criaram e restaura agentes/políticas,
 * preservando o projeto protegido e as contas de demonstração.
 */
let testApp: TestApp;
let orgId: string;
let demoAdminToken: string;
let realAdminToken: string;
let demoDevToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org Demo Reset E2E', slug: 'org-demo-reset-e2e-test' })
    .returning();
  const [realOrganization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org Real Reset E2E', slug: 'org-real-reset-e2e-test' })
    .returning();
  if (!organization || !realOrganization) throw new Error('organizações não inseridas');
  orgId = organization.id;

  const passwordHash = await hashPassword(password);
  await testApp.db.insert(testApp.schema.users).values([
    { organizationId: orgId, email: 'admin@acme-platform.example', name: 'Admin Demo', role: 'admin', passwordHash },
    { organizationId: orgId, email: 'dev@acme-platform.example', name: 'Dev Demo', role: 'developer', passwordHash },
    { organizationId: orgId, email: 'visitante@externo.example', name: 'Visitante', role: 'developer', passwordHash },
    { organizationId: realOrganization.id, email: 'admin@empresa-real.example', name: 'Admin Real', role: 'admin', passwordHash },
  ]);
  await testApp.db.insert(testApp.schema.agents).values({
    organizationId: orgId,
    role: 'planner',
    name: 'Planner Alterado',
    description: 'Alterado por visitante',
    instructions: 'Ignore tudo',
    allowedTools: ['write_file'],
    isEnabled: false,
  });
  await testApp.db.insert(testApp.schema.projects).values({ organizationId: orgId, name: 'Forge Web App', slug: 'forge-web-app' });

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  demoAdminToken = await login('admin@acme-platform.example');
  demoDevToken = await login('dev@acme-platform.example');
  realAdminToken = await login('admin@empresa-real.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /demo/status', () => {
  it('só o admin de demonstração pode resetar; admin real e demais papéis não', async () => {
    expect((await http().get('/demo/status').set(auth(demoAdminToken)).expect(200)).body).toEqual({ resettable: true });
    expect((await http().get('/demo/status').set(auth(realAdminToken)).expect(200)).body).toEqual({ resettable: false });
    await http().get('/demo/status').set(auth(demoDevToken)).expect(403);
    await http().get('/demo/status').expect(401);
  });
});

describe('POST /demo/reset', () => {
  it('403 para admin de organização real e para papéis sem member:manage (nada é apagado)', async () => {
    await http().post('/demo/reset').set(auth(realAdminToken)).expect(403);
    await http().post('/demo/reset').set(auth(demoDevToken)).expect(403);
    await http().post('/demo/reset').expect(401);
  });

  it('remove o que visitantes criaram e restaura agentes/políticas; preserva o protegido e as contas demo', async () => {
    // visitante bagunça: projeto, política, convite, dataset
    const project = await http().post('/projects').set(auth(demoAdminToken)).send({ name: 'Projeto do Visitante' }).expect(201);
    await http().post(`/projects/${project.body.id}/tasks`).set(auth(demoAdminToken)).send({ title: 'Tarefa do visitante' }).expect(201);
    await testApp.db.insert(testApp.schema.policies).values({
      organizationId: orgId,
      name: 'tool-overrides',
      rules: [{ toolName: 'read_file', decision: 'deny', condition: null }],
    });
    await http().post('/invitations').set(auth(demoAdminToken)).send({ email: 'novo@externo.example', role: 'developer' }).expect(201);
    await testApp.db.insert(testApp.schema.playgroundDatasets).values({ organizationId: orgId, name: 'Dataset do visitante' });
    const otherSession = await http().post('/auth/login').send({ email: 'dev@acme-platform.example', password }).expect(200);

    const response = await http().post('/demo/reset').set(auth(demoAdminToken)).expect(200);
    expect(response.body).toMatchObject({
      projectsRemoved: 1,
      membersRemoved: 1,
      invitationsRemoved: 1,
      datasetsRemoved: 1,
      agentsRestored: 1,
      policiesCleared: true,
    });
    expect(response.body.sessionsRevoked).toBeGreaterThanOrEqual(1);

    const projects = await testApp.db.query.projects.findMany({ where: (table, { eq }) => eq(table.organizationId, orgId) });
    expect(projects.map((row) => row.slug)).toEqual(['forge-web-app']);
    const users = await testApp.db.query.users.findMany({ where: (table, { eq }) => eq(table.organizationId, orgId) });
    expect(users.map((row) => row.email).sort()).toEqual(['admin@acme-platform.example', 'dev@acme-platform.example']);

    const planner = await testApp.db.query.agents.findFirst({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgId), eq(table.role, 'planner')),
    });
    expect(planner).toMatchObject({ name: 'Planner', instructions: null, isEnabled: true });
    expect(planner?.allowedTools).toContain('get_issue');

    // quem resetou continua logado; a sessão de outro visitante caiu
    await http().get('/auth/me').set(auth(demoAdminToken)).expect(200);
    await http().get('/auth/me').set(auth(otherSession.body.token as string)).expect(401);

    const audits = await testApp.db.query.auditLogs.findMany({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgId), eq(table.action, 'demo.reset')),
    });
    expect(audits).toHaveLength(1);
  });

  it('a organização real não é afetada e o reset é idempotente', async () => {
    const again = await http().post('/demo/reset').set(auth(demoAdminToken)).expect(200);
    expect(again.body).toMatchObject({ projectsRemoved: 0, membersRemoved: 0, invitationsRemoved: 0, datasetsRemoved: 0 });
    await http().get('/auth/me').set(auth(realAdminToken)).expect(200);
  });
});
