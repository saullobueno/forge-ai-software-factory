import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

let testApp: TestApp;
let organizationId: string;
let techLeadId: string;
let techLeadToken: string;
let developerToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org AI Playground E2E', slug: 'org-ai-playground-e2e-test' })
    .returning();
  if (!organization) throw new Error('organization não inserida');
  organizationId = organization.id;

  const passwordHash = await hashPassword(password);
  const users = await testApp.db.insert(testApp.schema.users).values([
    {
      organizationId: organization.id,
      email: 'tech-lead@org-ai-playground-e2e-test.example',
      name: 'Tech Lead',
      role: 'tech_lead',
      passwordHash,
    },
    {
      organizationId: organization.id,
      email: 'dev@org-ai-playground-e2e-test.example',
      name: 'Developer',
      role: 'developer',
      passwordHash,
    },
  ]).returning();
  const techLead = users.find((user) => user.email === 'tech-lead@org-ai-playground-e2e-test.example');
  if (!techLead) throw new Error('tech lead não inserido');
  techLeadId = techLead.id;

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  techLeadToken = await login('tech-lead@org-ai-playground-e2e-test.example');
  developerToken = await login('dev@org-ai-playground-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('AI Playground', () => {
  it('retorna modelos e dataset padrão para quem tem permissão', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/ai-playground/config')
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    expect(response.body.models).toHaveLength(3);
    expect(response.body.defaultDataset).toHaveLength(2);
    expect(response.body.models[0]).toMatchObject({
      id: 'forge-mock-fast',
      provider: 'mock',
    });
  });

  it('compara modelos com score, latência, tokens, custo e validação estruturada', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post('/ai-playground/evaluations')
      .set('Authorization', `Bearer ${techLeadToken}`)
      .send({
        prompt: 'Responda em JSON com decision, summary, evidence e gaps.',
        models: ['forge-mock-fast', 'forge-mock-balanced'],
        dataset: [
          {
            id: 'refund',
            title: 'Bug de estorno',
            input: 'Estorno aparece como cobrança positiva; validar sinal e teste.',
            expectedKeywords: ['estorno', 'sinal', 'teste'],
          },
        ],
        requireStructuredOutput: true,
      })
      .expect(201);

    expect(response.body.winner).toBe('forge-mock-balanced');
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0].cases[0]).toMatchObject({
      datasetItemId: 'refund',
      structuredOutputValid: true,
      matchedKeywords: ['estorno', 'sinal', 'teste'],
    });
    expect(response.body.results[0].cases[0].totalTokens).toBeGreaterThan(0);
    expect(response.body.results[0].cases[0].latencyMs).toBeGreaterThan(0);
    expect(response.body.results[0].cases[0].costUsd).toBeGreaterThanOrEqual(0);
    expect(response.body.results[0].averageScore).toBeGreaterThan(0);

    const { eq } = await import('@forge/database');
    const [auditLog] = await testApp.db.query.auditLogs.findMany({
      where: eq(testApp.schema.auditLogs.action, 'ai_playground.evaluated'),
      limit: 1,
    });
    expect(auditLog).toMatchObject({
      organizationId,
      actorType: 'user',
      actorUserId: techLeadId,
      action: 'ai_playground.evaluated',
      targetType: 'ai_playground',
      targetId: null,
    });
    expect(auditLog?.metadata).toMatchObject({
      models: ['forge-mock-fast', 'forge-mock-balanced'],
      datasetSize: 1,
      requireStructuredOutput: true,
      winner: 'forge-mock-balanced',
    });
    expect((auditLog?.metadata.totalTokens as number | undefined) ?? 0).toBeGreaterThan(0);
    expect((auditLog?.metadata.totalCostUsd as number | undefined) ?? -1).toBeGreaterThanOrEqual(0);
  });

  it('retorna 403 para papel sem permissão de playground', async () => {
    await request(testApp.app.getHttpServer())
      .get('/ai-playground/config')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/ai-playground/config').expect(401);
  });

  it('retorna 400 para modelo inválido', async () => {
    await request(testApp.app.getHttpServer())
      .post('/ai-playground/evaluations')
      .set('Authorization', `Bearer ${techLeadToken}`)
      .send({
        prompt: 'Teste',
        models: ['modelo-inexistente'],
        dataset: [{ id: 'case-1', title: 'Caso 1', input: 'Entrada.' }],
      })
      .expect(400);
  });
});
