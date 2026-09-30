import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações + servidor HTTP real, sem mocks) para o
 * painel cross-execução de aprovações pendentes (Fase 17 continuação #2,
 * `GET /approvals/pending`). Semeia diretamente uma `approval` `pending`
 * de cada tipo (`agent_run`, `deployment`) — não precisa disparar um
 * orquestrador real nem um pedido de deployment real: este endpoint é
 * só leitura, então o que importa aqui é o estado final em `approvals` +
 * as tabelas relacionadas (`agentRuns`/`tasks`, `deployments`/`environments`),
 * não como ele foi produzido (isso já é coberto por
 * `agent-runs.e2e-spec.ts`/`environments.e2e-spec.ts`).
 */
let testApp: TestApp;

let developerAToken: string;
let techLeadAToken: string;
let adminAToken: string;
let techLeadBToken: string;

let pendingAgentRunApprovalId: string;
let agentRunId: string;
let taskId: string;
let projectId: string;

let pendingDeploymentApprovalId: string;
let deploymentId: string;
let environmentId: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Approvals E2E', slug: 'org-a-approvals-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Approvals E2E', slug: 'org-b-approvals-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);

  const [developerA, techLeadA, adminA, techLeadB] = await testApp.db
    .insert(testApp.schema.users)
    .values([
      {
        organizationId: organizationA.id,
        email: 'dev@org-a-approvals-e2e-test.example',
        name: 'Dev A',
        role: 'developer',
        passwordHash,
      },
      {
        organizationId: organizationA.id,
        email: 'tech-lead@org-a-approvals-e2e-test.example',
        name: 'Tech Lead A',
        role: 'tech_lead',
        passwordHash,
      },
      {
        organizationId: organizationA.id,
        email: 'admin@org-a-approvals-e2e-test.example',
        name: 'Admin A',
        role: 'admin',
        passwordHash,
      },
      {
        organizationId: organizationB.id,
        email: 'tech-lead@org-b-approvals-e2e-test.example',
        name: 'Tech Lead B',
        role: 'tech_lead',
        passwordHash,
      },
    ])
    .returning();
  if (!developerA || !techLeadA || !adminA || !techLeadB) throw new Error('users não inseridos');

  const [project] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project Approvals E2E', slug: 'project-approvals-e2e-test' })
    .returning();
  if (!project) throw new Error('project não inserido');
  projectId = project.id;

  const [task] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({ organizationId: organizationA.id, projectId: project.id, title: 'Corrigir cálculo de estornos' })
    .returning();
  if (!task) throw new Error('task não inserida');
  taskId = task.id;

  const [agent] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId: organizationA.id, role: 'implementer', name: 'Implementer' })
    .returning();
  if (!agent) throw new Error('agent não inserido');

  const [agentRun] = await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({
      organizationId: organizationA.id,
      taskId: task.id,
      agentId: agent.id,
      status: 'approval_required',
      objective: 'Corrigir cálculo de estornos',
    })
    .returning();
  if (!agentRun) throw new Error('agentRun não inserido');
  agentRunId = agentRun.id;

  const [environment] = await testApp.db
    .insert(testApp.schema.environments)
    .values({
      organizationId: organizationA.id,
      projectId: project.id,
      kind: 'production',
      name: 'Production',
      isProtected: true,
    })
    .returning();
  if (!environment) throw new Error('environment não inserido');
  environmentId = environment.id;

  const [deployment] = await testApp.db
    .insert(testApp.schema.deployments)
    .values({
      organizationId: organizationA.id,
      projectId: project.id,
      environmentId: environment.id,
      commitSha: 'deadbeef',
      status: 'queued',
    })
    .returning();
  if (!deployment) throw new Error('deployment não inserido');
  deploymentId = deployment.id;

  // Duas `approvals` `pending`, uma de cada `subjectType`, com
  // `createdAt` explícito e distinto — a ordenação retornada pelo endpoint
  // (mais antiga primeiro) precisa ser verificável de forma determinística,
  // não depender de quão rápido o `insert` rodou.
  const [pendingAgentRunApproval, pendingDeploymentApproval] = await testApp.db
    .insert(testApp.schema.approvals)
    .values([
      {
        organizationId: organizationA.id,
        subjectType: 'agent_run',
        subjectId: agentRun.id,
        status: 'pending',
        requestedByUserId: developerA.id,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        organizationId: organizationA.id,
        subjectType: 'deployment',
        subjectId: deployment.id,
        status: 'pending',
        requestedByUserId: techLeadA.id,
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      },
    ])
    .returning();
  if (!pendingAgentRunApproval || !pendingDeploymentApproval) throw new Error('approvals pendentes não inseridas');
  pendingAgentRunApprovalId = pendingAgentRunApproval.id;
  pendingDeploymentApprovalId = pendingDeploymentApproval.id;

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  developerAToken = await login('dev@org-a-approvals-e2e-test.example');
  techLeadAToken = await login('tech-lead@org-a-approvals-e2e-test.example');
  adminAToken = await login('admin@org-a-approvals-e2e-test.example');
  techLeadBToken = await login('tech-lead@org-b-approvals-e2e-test.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /approvals/pending', () => {
  it('retorna 403 para quem não tem agent_run:approve nem environment:approve_deployment', async () => {
    await request(testApp.app.getHttpServer())
      .get('/approvals/pending')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(403);
  });

  it('tech_lead (só agent_run:approve) vê a approval de agent_run, mas não a de deployment', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/approvals/pending')
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);

    expect(response.body).toEqual([
      {
        id: pendingAgentRunApprovalId,
        subjectType: 'agent_run',
        createdAt: expect.any(String),
        requestedByUserId: expect.any(String),
        reason: null,
        agentRunId,
        agentRunObjective: 'Corrigir cálculo de estornos',
        taskId,
        taskTitle: 'Corrigir cálculo de estornos',
        projectId,
        projectName: 'Project Approvals E2E',
      },
    ]);
  });

  it('admin (agent_run:approve E environment:approve_deployment) vê as duas, mais antiga primeiro', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/approvals/pending')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({ id: pendingAgentRunApprovalId, subjectType: 'agent_run' });
    expect(response.body[1]).toMatchObject({
      id: pendingDeploymentApprovalId,
      subjectType: 'deployment',
      deploymentId,
      environmentId,
      environmentName: 'Production',
      projectId,
      projectName: 'Project Approvals E2E',
    });
  });

  it('isola por tenant: um tech_lead de outra organização não vê nenhuma approval da Org A', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/approvals/pending')
      .set('Authorization', `Bearer ${techLeadBToken}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/approvals/pending').expect(401);
  });
});
