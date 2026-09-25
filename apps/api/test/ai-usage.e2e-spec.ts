import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

let testApp: TestApp;
let techLeadToken: string;
let developerToken: string;
let taskAId: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A AI Usage E2E', slug: 'org-a-ai-usage-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B AI Usage E2E', slug: 'org-b-ai-usage-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);
  const [techLead, developer] = await testApp.db
    .insert(testApp.schema.users)
    .values([
      {
        organizationId: organizationA.id,
        email: 'tech-lead@org-a-ai-usage-e2e-test.example',
        name: 'Tech Lead Usage',
        role: 'tech_lead',
        passwordHash,
      },
      {
        organizationId: organizationA.id,
        email: 'dev@org-a-ai-usage-e2e-test.example',
        name: 'Developer Usage',
        role: 'developer',
        passwordHash,
      },
    ])
    .returning();
  if (!techLead || !developer) throw new Error('users não inseridos');

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'AI Usage Project A', slug: 'ai-usage-project-a' })
    .returning();
  if (!projectA) throw new Error('project não inserido');

  const [taskA] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({ organizationId: organizationA.id, projectId: projectA.id, title: 'Testar limite de uso IA' })
    .returning();
  if (!taskA) throw new Error('task não inserida');
  taskAId = taskA.id;

  const [agentA] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId: organizationA.id, role: 'planner', name: 'Planner Usage Limits' })
    .returning();
  if (!agentA) throw new Error('agent não inserido');

  const [agentRunA] = await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({
      organizationId: organizationA.id,
      taskId: taskA.id,
      agentId: agentA.id,
      status: 'completed',
      objective: 'Execução com usage e latência',
    })
    .returning();
  if (!agentRunA) throw new Error('agentRun não inserido');

  const [geminiStep, groqStep] = await testApp.db
    .insert(testApp.schema.agentSteps)
    .values([
      {
        agentRunId: agentRunA.id,
        name: 'Planejar com Gemini',
        role: 'planner',
        status: 'succeeded',
        input: {},
        output: {},
        durationMs: 1_200,
      },
      {
        agentRunId: agentRunA.id,
        name: 'Revisar com Groq',
        role: 'reviewer',
        status: 'succeeded',
        input: {},
        output: {},
        durationMs: 800,
      },
    ])
    .returning();
  if (!geminiStep || !groqStep) throw new Error('agentSteps não inseridos');

  await testApp.db.insert(testApp.schema.aiUsages).values([
    {
      organizationId: organizationA.id,
      agentRunId: agentRunA.id,
      agentStepId: geminiStep.id,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      costUsd: '0.001500',
    },
    {
      organizationId: organizationA.id,
      agentRunId: agentRunA.id,
      agentStepId: groqStep.id,
      provider: 'groq',
      model: 'llama-3.1-70b-versatile',
      promptTokens: 200,
      completionTokens: 75,
      totalTokens: 275,
      costUsd: '0.002750',
    },
    {
      organizationId: organizationA.id,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 25,
      completionTokens: 25,
      totalTokens: 50,
      costUsd: '0.000500',
    },
    {
      organizationId: organizationB.id,
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      promptTokens: 999,
      completionTokens: 999,
      totalTokens: 1998,
      costUsd: '9.990000',
    },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  techLeadToken = await login('tech-lead@org-a-ai-usage-e2e-test.example');
  developerToken = await login('dev@org-a-ai-usage-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /ai-usage/summary', () => {
  it('agrega somente uso de IA da própria organização para quem tem audit_log:read', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/ai-usage/summary')
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    expect(response.body.totals).toMatchObject({
      promptTokens: 325,
      completionTokens: 150,
      totalTokens: 475,
      callCount: 3,
      averageDurationMs: 1000,
      durationSampleCount: 2,
    });
    expect(response.body.totals.costUsd).toBeCloseTo(0.00475);
    expect(response.body.byProvider).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          promptTokens: 125,
          completionTokens: 75,
          totalTokens: 200,
          callCount: 2,
          averageDurationMs: 1200,
          durationSampleCount: 1,
        }),
        expect.objectContaining({
          provider: 'groq',
          model: 'llama-3.1-70b-versatile',
          promptTokens: 200,
          completionTokens: 75,
          totalTokens: 275,
          callCount: 1,
          averageDurationMs: 800,
          durationSampleCount: 1,
        }),
      ]),
    );
    expect(response.body.sampleSize).toBe(3);
    expect(response.body.recent).toHaveLength(3);
    expect(response.body.recent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'gemini', durationMs: 1200 }),
        expect.objectContaining({ provider: 'groq', durationMs: 800 }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('gemini-2.5-pro');
    expect(JSON.stringify(response.body)).not.toContain('9.99');
  });

  it('retorna 403 para papel sem audit_log:read', async () => {
    await request(testApp.app.getHttpServer())
      .get('/ai-usage/summary')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/ai-usage/summary').expect(401);
  });
});

describe('limites de uso de IA', () => {
  it('bloqueia nova execução quando o limite diário de tokens da organização já foi atingido', async () => {
    process.env['AI_ORG_DAILY_TOKEN_LIMIT'] = '400';
    try {
      const response = await request(testApp.app.getHttpServer())
        .post(`/tasks/${taskAId}/agent-runs`)
        .set('Authorization', `Bearer ${techLeadToken}`)
        .expect(429);

      expect(response.body.message).toBe('Limite diário de uso de IA atingido para esta organização.');
      expect(response.body.exceeded).toContain('tokens');
      expect(response.body.totals.totalTokens).toBe(475);
    } finally {
      delete process.env['AI_ORG_DAILY_TOKEN_LIMIT'];
    }
  });
});
