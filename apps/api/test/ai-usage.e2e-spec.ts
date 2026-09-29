import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

let testApp: TestApp;
let techLeadToken: string;
let developerToken: string;
let taskAId: string;
let organizationAId: string;
let techLeadUserId: string;
let agentAId: string;

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
  organizationAId = organizationA.id;
  techLeadUserId = techLead.id;

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
  agentAId = agentA.id;

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

  it('inclui uma série histórica diária (14 dias, hoje com os totais reais seedados)', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/ai-usage/summary')
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    expect(response.body.timeseries).toHaveLength(14);

    const todayKey = new Date().toISOString().slice(0, 10);
    const dates = response.body.timeseries.map((point: { date: string }) => point.date);
    expect(dates).toEqual([...dates].sort((left, right) => left.localeCompare(right)));
    expect(dates[dates.length - 1]).toBe(todayKey);
    expect(new Set(dates).size).toBe(14);

    const today = response.body.timeseries.find((point: { date: string }) => point.date === todayKey);
    expect(today).toMatchObject({ totalTokens: 475, callCount: 3 });
    expect(today.costUsd).toBeCloseTo(0.00475);

    // Nenhum ponto da série pode carregar dados de outra organização (Org
    // B, seedada no `beforeAll` com 1998 tokens/custo 9.99).
    expect(JSON.stringify(response.body.timeseries)).not.toContain('9.99');
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

describe('GET /ai-usage/me', () => {
  it('retorna o uso das últimas 24h do PRÓPRIO usuário, mesmo sem audit_log:read', async () => {
    // `developer` não tem `audit_log:read` (403 em /ai-usage/summary, ver
    // acima) — `/me` (Fase 13 continuação #7) é dado do próprio usuário,
    // não um agregado da organização, então não exige essa permissão.
    const response = await request(testApp.app.getHttpServer())
      .get('/ai-usage/me')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(200);

    expect(response.body.totals.totalTokens).toBe(0);
    expect(response.body.limits).toEqual({ dailyTokenLimit: null, dailyCostLimitUsd: null });
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/ai-usage/me').expect(401);
  });
});

describe('GET /ai-usage/provider-config', () => {
  it('retorna mock por padrão (sem AI_PROVIDER), visível mesmo sem audit_log:read', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/ai-usage/provider-config')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(200);

    expect(response.body).toEqual({
      provider: 'mock',
      model: null,
      apiKeyConfigured: true,
      requestTimeoutMs: null,
    });
  });

  it('reflete AI_PROVIDER/modelo/chave real configurados via env, sem nunca expor a chave', async () => {
    process.env['AI_PROVIDER'] = 'groq';
    process.env['GROQ_API_KEY'] = 'super-secret-test-key';
    process.env['GROQ_MODEL'] = 'llama-3.1-70b-versatile';
    try {
      const response = await request(testApp.app.getHttpServer())
        .get('/ai-usage/provider-config')
        .set('Authorization', `Bearer ${techLeadToken}`)
        .expect(200);

      expect(response.body).toEqual({
        provider: 'groq',
        model: 'llama-3.1-70b-versatile',
        apiKeyConfigured: true,
        requestTimeoutMs: null,
      });
      expect(JSON.stringify(response.body)).not.toContain('super-secret-test-key');
    } finally {
      delete process.env['AI_PROVIDER'];
      delete process.env['GROQ_API_KEY'];
      delete process.env['GROQ_MODEL'];
    }
  });

  it('reporta apiKeyConfigured=false quando o provider real está selecionado mas sem a chave', async () => {
    process.env['AI_PROVIDER'] = 'anthropic';
    process.env['ANTHROPIC_MODEL'] = 'claude-test';
    try {
      const response = await request(testApp.app.getHttpServer())
        .get('/ai-usage/provider-config')
        .set('Authorization', `Bearer ${techLeadToken}`)
        .expect(200);

      expect(response.body).toEqual({
        provider: 'anthropic',
        model: 'claude-test',
        apiKeyConfigured: false,
        requestTimeoutMs: null,
      });
    } finally {
      delete process.env['AI_PROVIDER'];
      delete process.env['ANTHROPIC_MODEL'];
    }
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/ai-usage/provider-config').expect(401);
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
      expect(response.body.scope).toBe('organization');
      expect(response.body.exceeded).toContain('tokens');
      expect(response.body.totals.totalTokens).toBe(475);
    } finally {
      delete process.env['AI_ORG_DAILY_TOKEN_LIMIT'];
    }
  });

  /**
   * Camada ADICIONAL por usuário (Fase 13 continuação #7): seed próprio
   * (não reaproveita `agentRunA`/`ai_usages` do `beforeAll`, que nunca
   * teve `requestedByUserId` preenchido) — um `agentRun` real atribuído a
   * `techLead` via `requestedByUserId`, com uso de IA real associado, que
   * sozinho já ultrapassa um limite POR USUÁRIO bem menor que qualquer
   * teto de organização configurado neste describe block.
   */
  it('bloqueia nova execução quando o limite diário de tokens do USUÁRIO já foi atingido, mesmo a organização estando dentro do limite', async () => {
    const [techLeadAgentRun] = await testApp.db
      .insert(testApp.schema.agentRuns)
      .values({
        organizationId: organizationAId,
        taskId: taskAId,
        agentId: agentAId,
        status: 'completed',
        objective: 'Execução atribuída ao tech lead (teste de limite por usuário)',
        requestedByUserId: techLeadUserId,
      })
      .returning();
    if (!techLeadAgentRun) throw new Error('agentRun do tech lead não inserido');

    await testApp.db.insert(testApp.schema.aiUsages).values({
      organizationId: organizationAId,
      agentRunId: techLeadAgentRun.id,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 300,
      completionTokens: 300,
      totalTokens: 600,
      costUsd: '0.006000',
    });

    process.env['AI_USER_DAILY_TOKEN_LIMIT'] = '500';
    try {
      const response = await request(testApp.app.getHttpServer())
        .post(`/tasks/${taskAId}/agent-runs`)
        .set('Authorization', `Bearer ${techLeadToken}`)
        .expect(429);

      expect(response.body.message).toBe('Limite diário de uso de IA atingido para este usuário.');
      expect(response.body.scope).toBe('user');
      expect(response.body.exceeded).toContain('tokens');
      expect(response.body.totals.totalTokens).toBe(600);

      // Prova de isolamento: `GET /ai-usage/me` do PRÓPRIO tech lead
      // reflete o mesmo total usado para bloquear — não um número
      // inventado à parte.
      const me = await request(testApp.app.getHttpServer())
        .get('/ai-usage/me')
        .set('Authorization', `Bearer ${techLeadToken}`)
        .expect(200);
      expect(me.body.totals.totalTokens).toBe(600);
    } finally {
      delete process.env['AI_USER_DAILY_TOKEN_LIMIT'];
    }
  });

  it('NÃO bloqueia outro usuário da mesma organização quando só o limite por usuário do primeiro foi atingido', async () => {
    // `developer` nunca teve nenhum `agentRun`/`ai_usages` atribuído a si
    // (`requestedByUserId`) neste arquivo — o total por usuário dele é
    // sempre 0, então mesmo um limite de 500 tokens não bloqueia.
    process.env['AI_USER_DAILY_TOKEN_LIMIT'] = '500';
    try {
      await request(testApp.app.getHttpServer())
        .post(`/tasks/${taskAId}/agent-runs`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(201);
    } finally {
      delete process.env['AI_USER_DAILY_TOKEN_LIMIT'];
    }
  });
});
