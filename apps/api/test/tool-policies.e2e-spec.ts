import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) das políticas de ferramentas por
 * organização: RBAC (`policy:manage`), validação, regra tighten-only,
 * isolamento de tenant e auditoria.
 */
let testApp: TestApp;
let orgAId: string;
let developerAToken: string;
let platformAToken: string;
let platformBToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Policies E2E', slug: 'org-a-policies-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Policies E2E', slug: 'org-b-policies-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');
  orgAId = organizationA.id;

  const passwordHash = await hashPassword(password);
  await testApp.db.insert(testApp.schema.users).values([
    { organizationId: organizationA.id, email: 'dev@a-policies.example', name: 'Dev A', role: 'developer', passwordHash },
    { organizationId: organizationA.id, email: 'platform@a-policies.example', name: 'Platform A', role: 'platform_engineer', passwordHash },
    { organizationId: organizationB.id, email: 'platform@b-policies.example', name: 'Platform B', role: 'platform_engineer', passwordHash },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  developerAToken = await login('dev@a-policies.example');
  platformAToken = await login('platform@a-policies.example');
  platformBToken = await login('platform@b-policies.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type ToolView = { toolName: string; defaultDecision: string; decision: string };
const find = (body: ToolView[], name: string) => body.find((tool) => tool.toolName === name);

describe('políticas de ferramentas', () => {
  it('lista todas as ferramentas com o padrão do sistema', async () => {
    const response = await http().get('/policies/tools').set(auth(platformAToken)).expect(200);
    expect(find(response.body, 'read_file')).toEqual({ toolName: 'read_file', defaultDecision: 'allow', decision: 'allow' });
    expect(find(response.body, 'write_file')).toEqual({
      toolName: 'write_file',
      defaultDecision: 'require_approval',
      decision: 'require_approval',
    });
  });

  it('403 sem policy:manage e 401 sem token', async () => {
    await http().get('/policies/tools').set(auth(developerAToken)).expect(403);
    await http().put('/policies/tools/read_file').set(auth(developerAToken)).send({ decision: 'deny' }).expect(403);
    await http().get('/policies/tools').expect(401);
  });

  it('torna uma ferramenta mais restritiva, persiste, audita e isola por organização', async () => {
    const update = await http()
      .put('/policies/tools/read_file')
      .set(auth(platformAToken))
      .send({ decision: 'require_approval' })
      .expect(200);
    expect(find(update.body, 'read_file')).toMatchObject({ defaultDecision: 'allow', decision: 'require_approval' });

    const again = await http().get('/policies/tools').set(auth(platformAToken)).expect(200);
    expect(find(again.body, 'read_file')?.decision).toBe('require_approval');

    const otherOrg = await http().get('/policies/tools').set(auth(platformBToken)).expect(200);
    expect(find(otherOrg.body, 'read_file')?.decision).toBe('allow');

    const logs = await testApp.db.query.auditLogs.findMany({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgAId), eq(table.action, 'policy.tool_updated')),
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.metadata).toMatchObject({ toolName: 'read_file', decision: 'require_approval' });
  });

  it('voltar ao padrão remove o ajuste', async () => {
    await http().put('/policies/tools/list_files').set(auth(platformAToken)).send({ decision: 'deny' }).expect(200);
    const reset = await http().put('/policies/tools/list_files').set(auth(platformAToken)).send({ decision: 'allow' }).expect(200);
    expect(find(reset.body, 'list_files')?.decision).toBe('allow');
  });

  it('422 ao tentar afrouxar o padrão, 400 para decisão inválida, 404 para ferramenta desconhecida', async () => {
    await http().put('/policies/tools/write_file').set(auth(platformAToken)).send({ decision: 'allow' }).expect(422);
    await http().put('/policies/tools/read_file').set(auth(platformAToken)).send({ decision: 'talvez' }).expect(400);
    await http().put('/policies/tools/inexistente').set(auth(platformAToken)).send({ decision: 'deny' }).expect(404);
    const after = await http().get('/policies/tools').set(auth(platformAToken)).expect(200);
    expect(find(after.body, 'write_file')?.decision).toBe('require_approval');
  });
});
