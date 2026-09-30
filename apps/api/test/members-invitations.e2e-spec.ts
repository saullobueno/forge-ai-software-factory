import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) de Configurações → Usuários e
 * Convites: RBAC (`member:manage` só do admin), último admin, auto-alteração,
 * contas de demonstração protegidas, isolamento de tenant, token de convite
 * (hash no banco, uso único, expiração, revogação) e auditoria.
 */
let testApp: TestApp;
let orgAId: string;
let adminAToken: string;
let leadAToken: string;
let adminBToken: string;
let devAId: string;
let leadAId: string;
let adminAId: string;
let demoId: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Members E2E', slug: 'org-a-members-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Members E2E', slug: 'org-b-members-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');
  orgAId = organizationA.id;

  const passwordHash = await hashPassword(password);
  const users = await testApp.db
    .insert(testApp.schema.users)
    .values([
      { organizationId: organizationA.id, email: 'admin@a-members.example', name: 'Admin A', role: 'admin', passwordHash },
      { organizationId: organizationA.id, email: 'lead@a-members.example', name: 'Lead A', role: 'tech_lead', passwordHash },
      { organizationId: organizationA.id, email: 'dev@a-members.example', name: 'Dev A', role: 'developer', passwordHash },
      { organizationId: organizationA.id, email: 'demo@acme-platform.example', name: 'Demo A', role: 'developer', passwordHash },
      { organizationId: organizationB.id, email: 'admin@b-members.example', name: 'Admin B', role: 'admin', passwordHash },
    ])
    .returning();
  const idOf = (email: string) => users.find((user) => user.email === email)?.id ?? '';
  adminAId = idOf('admin@a-members.example');
  leadAId = idOf('lead@a-members.example');
  devAId = idOf('dev@a-members.example');
  demoId = idOf('demo@acme-platform.example');

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  adminAToken = await login('admin@a-members.example');
  leadAToken = await login('lead@a-members.example');
  adminBToken = await login('admin@b-members.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function auditActions(action: string) {
  const rows = await testApp.db.query.auditLogs.findMany({
    where: (table, { and, eq }) => and(eq(table.organizationId, orgAId), eq(table.action, action)),
  });
  return rows.map((row) => row.targetId);
}

describe('membros', () => {
  it('lista só os membros da própria organização, marcando contas de demonstração', async () => {
    const response = await http().get('/members').set(auth(adminAToken)).expect(200);
    const emails = (response.body as { email: string }[]).map((member) => member.email);
    expect(emails).toContain('dev@a-members.example');
    expect(emails).not.toContain('admin@b-members.example');
    expect(response.body.find((member: { email: string }) => member.email === 'demo@acme-platform.example').isProtected).toBe(true);
    expect(response.body.find((member: { email: string }) => member.email === 'dev@a-members.example').isProtected).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('403 sem member:manage e 401 sem token', async () => {
    await http().get('/members').set(auth(leadAToken)).expect(403);
    await http().patch(`/members/${devAId}`).set(auth(leadAToken)).send({ role: 'admin' }).expect(403);
    await http().delete(`/members/${devAId}`).set(auth(leadAToken)).expect(403);
    await http().get('/invitations').set(auth(leadAToken)).expect(403);
    await http().get('/members').expect(401);
  });

  it('altera o papel, audita e a permissão muda no próximo login', async () => {
    const response = await http().patch(`/members/${devAId}`).set(auth(adminAToken)).send({ role: 'qa_engineer' }).expect(200);
    expect(response.body).toMatchObject({ id: devAId, role: 'qa_engineer' });
    expect(await auditActions('member.role_changed')).toContain(devAId);
    await http().patch(`/members/${devAId}`).set(auth(adminAToken)).send({ role: 'developer' }).expect(200);
  });

  it('regras: não altera/remove a si mesmo nem o último admin, nem conta de demonstração; 400/404', async () => {
    await http().patch(`/members/${adminAId}`).set(auth(adminAToken)).send({ role: 'developer' }).expect(409);
    await http().delete(`/members/${adminAId}`).set(auth(adminAToken)).expect(409);
    await http().patch(`/members/${demoId}`).set(auth(adminAToken)).send({ role: 'admin' }).expect(403);
    await http().delete(`/members/${demoId}`).set(auth(adminAToken)).expect(403);
    await http().patch(`/members/${devAId}`).set(auth(adminAToken)).send({ role: 'rei' }).expect(400);
    await http().patch('/members/nao-e-uuid').set(auth(adminAToken)).send({ role: 'admin' }).expect(404);
  });

  it('o último admin não pode ser rebaixado por outro admin se for o único (contagem)', async () => {
    await http().patch(`/members/${leadAId}`).set(auth(adminAToken)).send({ role: 'admin' }).expect(200);
    const secondAdminToken = (
      await http().post('/auth/login').send({ email: 'lead@a-members.example', password }).expect(200)
    ).body.token as string;
    // agora há 2 admins: o segundo pode rebaixar o primeiro, mas depois ninguém pode rebaixar o que sobrou
    await http().patch(`/members/${adminAId}`).set(auth(secondAdminToken)).send({ role: 'developer' }).expect(200);
    await http().patch(`/members/${leadAId}`).set(auth(secondAdminToken)).send({ role: 'developer' }).expect(409);
    await http().patch(`/members/${adminAId}`).set(auth(secondAdminToken)).send({ role: 'admin' }).expect(200);
    await http().patch(`/members/${leadAId}`).set(auth(adminAToken)).send({ role: 'tech_lead' }).expect(200);
  });

  it('isolamento: admin da B não vê nem altera membro da A (404)', async () => {
    await http().patch(`/members/${devAId}`).set(auth(adminBToken)).send({ role: 'admin' }).expect(404);
    await http().delete(`/members/${devAId}`).set(auth(adminBToken)).expect(404);
  });

  it('remove um membro e audita', async () => {
    const [extra] = await testApp.db
      .insert(testApp.schema.users)
      .values({ organizationId: orgAId, email: 'extra@a-members.example', name: 'Extra', role: 'developer' })
      .returning();
    if (!extra) throw new Error('usuário não inserido');
    await http().delete(`/members/${extra.id}`).set(auth(adminAToken)).expect(204);
    expect(await auditActions('member.removed')).toContain(extra.id);
    await http().delete(`/members/${extra.id}`).set(auth(adminAToken)).expect(404);
  });
});

describe('convites', () => {
  async function invite(email: string, role = 'developer') {
    const response = await http().post('/invitations').set(auth(adminAToken)).send({ email, role }).expect(201);
    return response.body as { id: string; token: string; status: string; email: string };
  }

  it('cria convite (token só na criação, hash no banco), consulta publicamente e aceita uma única vez', async () => {
    const created = await invite('Nova.Pessoa@Externo.example');
    expect(created).toMatchObject({ email: 'nova.pessoa@externo.example', status: 'pending' });
    expect(created.token.length).toBeGreaterThan(30);

    const stored = await testApp.db.query.invitations.findFirst({ where: (table, { eq }) => eq(table.id, created.id) });
    expect(stored?.tokenHash).toBeDefined();
    expect(stored?.tokenHash).not.toBe(created.token);

    const listed = await http().get('/invitations').set(auth(adminAToken)).expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(created.token);

    const lookup = await http().get(`/invitations/lookup/${created.token}`).expect(200);
    expect(lookup.body).toEqual({ email: 'nova.pessoa@externo.example', role: 'developer', organizationName: 'Org A Members E2E' });

    await http().post('/invitations/accept').send({ token: created.token, name: 'Nova Pessoa', password: 'senha-forte-1' }).expect(201);
    const session = await http().post('/auth/login').send({ email: 'nova.pessoa@externo.example', password: 'senha-forte-1' }).expect(200);
    expect(session.body.user).toMatchObject({ role: 'developer', organizationId: orgAId });

    await http().post('/invitations/accept').send({ token: created.token, name: 'Outra', password: 'senha-forte-2' }).expect(404);
    await http().get(`/invitations/lookup/${created.token}`).expect(404);
    expect(await auditActions('invitation.accepted')).toContain(created.id);
  });

  it('409 para e-mail já cadastrado e 400 para corpo inválido; 403 sem permissão', async () => {
    await http().post('/invitations').set(auth(adminAToken)).send({ email: 'dev@a-members.example', role: 'developer' }).expect(409);
    await http().post('/invitations').set(auth(adminAToken)).send({ email: 'isto-nao-e-email', role: 'developer' }).expect(400);
    await http().post('/invitations').set(auth(adminAToken)).send({ email: 'x@externo.example', role: 'rei' }).expect(400);
    await http().post('/invitations').set(auth(leadAToken)).send({ email: 'x@externo.example', role: 'developer' }).expect(403);
  });

  it('reconvidar o mesmo e-mail revoga o convite anterior', async () => {
    const first = await invite('dupla@externo.example');
    const second = await invite('dupla@externo.example', 'qa_engineer');
    await http().get(`/invitations/lookup/${first.token}`).expect(404);
    await http().get(`/invitations/lookup/${second.token}`).expect(200);
  });

  it('revoga convite pendente (204), 409 se já não está pendente, 404 cross-tenant', async () => {
    const created = await invite('revogar@externo.example');
    await http().delete(`/invitations/${created.id}`).set(auth(adminBToken)).expect(404);
    await http().delete(`/invitations/${created.id}`).set(auth(adminAToken)).expect(204);
    await http().delete(`/invitations/${created.id}`).set(auth(adminAToken)).expect(409);
    await http().get(`/invitations/lookup/${created.token}`).expect(404);
    const listed = await http().get('/invitations').set(auth(adminAToken)).expect(200);
    expect(listed.body.find((item: { id: string }) => item.id === created.id).status).toBe('revoked');
    expect(await auditActions('invitation.revoked')).toContain(created.id);
  });

  it('convite expirado não pode ser consultado nem aceito', async () => {
    const created = await invite('expirado@externo.example');
    await testApp.db
      .update(testApp.schema.invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where((await import('@forge/database')).eq(testApp.schema.invitations.id, created.id));
    await http().get(`/invitations/lookup/${created.token}`).expect(404);
    await http().post('/invitations/accept').send({ token: created.token, name: 'Tarde', password: 'senha-forte-1' }).expect(404);
    const listed = await http().get('/invitations').set(auth(adminAToken)).expect(200);
    expect(listed.body.find((item: { id: string }) => item.id === created.id).status).toBe('expired');
  });

  it('token inexistente ou corpo inválido no aceite', async () => {
    await http().get('/invitations/lookup/token-que-nao-existe').expect(404);
    await http().post('/invitations/accept').send({ token: 'curto', name: '', password: '123' }).expect(400);
  });
});
