import { JwtService } from '@nestjs/jwt';
import { generateTotp, hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) de sessões revogáveis, refresh rotativo com detecção de
 * reuso, expiração do acesso curto, papel sempre fresco, limite de tentativas de login, 2FA TOTP
 * (setup, login em dois passos, replay, recuperação, desativação) e cabeçalhos de segurança.
 */
let testApp: TestApp;
let orgId: string;
let devId: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org Auth E2E', slug: 'org-auth-e2e-test' })
    .returning();
  if (!organization) throw new Error('organização não inserida');
  orgId = organization.id;

  const passwordHash = await hashPassword(password);
  const users = await testApp.db
    .insert(testApp.schema.users)
    .values([
      { organizationId: orgId, email: 'admin@auth-e2e.example', name: 'Admin', role: 'admin', passwordHash },
      { organizationId: orgId, email: 'dev@auth-e2e.example', name: 'Dev', role: 'tech_lead', passwordHash },
      { organizationId: orgId, email: 'lock@auth-e2e.example', name: 'Lock', role: 'developer', passwordHash },
      { organizationId: orgId, email: 'two@auth-e2e.example', name: 'Dois Fatores', role: 'developer', passwordHash },
      { organizationId: orgId, email: 'gone@auth-e2e.example', name: 'Gone', role: 'developer', passwordHash },
      { organizationId: orgId, email: 'demo@acme-platform.example', name: 'Demo', role: 'developer', passwordHash },
    ])
    .returning();
  devId = users.find((user) => user.email === 'dev@auth-e2e.example')?.id ?? '';
});

afterAll(async () => {
  delete process.env['ACCESS_TOKEN_TTL_MINUTES'];
  await testApp.cleanup();
});

afterEach(() => {
  delete process.env['ACCESS_TOKEN_TTL_MINUTES'];
});

const http = () => request(testApp.app.getHttpServer());
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function cookieValue(setCookie: string[] | undefined, name: string): string | undefined {
  const line = setCookie?.find((item) => item.startsWith(`${name}=`));
  return line?.split(';')[0]?.slice(name.length + 1);
}

async function login(email: string) {
  const response = await http().post('/auth/login').send({ email, password }).expect(200);
  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  return {
    token: response.body.token as string,
    refresh: cookieValue(setCookie, 'forge_refresh') ?? '',
    setCookie: setCookie ?? [],
  };
}

const refreshWith = (refresh: string) => http().post('/auth/refresh').set('Cookie', `forge_refresh=${refresh}`);

describe('sessão e refresh', () => {
  it('login emite acesso curto + cookies httpOnly (refresh restrito a /api/auth) e o acesso funciona', async () => {
    const session = await login('dev@auth-e2e.example');
    expect(session.setCookie.find((line) => line.startsWith('forge_session='))).toContain('HttpOnly');
    const refreshLine = session.setCookie.find((line) => line.startsWith('forge_refresh=')) ?? '';
    expect(refreshLine).toContain('HttpOnly');
    expect(refreshLine).toContain('Path=/api/auth');
    expect(session.refresh.length).toBeGreaterThan(30);

    const me = await http().get('/auth/me').set(bearer(session.token)).expect(200);
    expect(me.body.email).toBe('dev@auth-e2e.example');
    const [row] = await testApp.db.query.userSessions.findMany({ where: (table, { eq }) => eq(table.userId, devId) });
    expect(row?.refreshTokenHash).not.toBe(session.refresh);
  });

  it('o acesso expira rápido e o refresh o renova rotacionando o token', async () => {
    process.env['ACCESS_TOKEN_TTL_MINUTES'] = '0.01';
    const session = await login('dev@auth-e2e.example');
    await http().get('/auth/me').set(bearer(session.token)).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 2200));
    await http().get('/auth/me').set(bearer(session.token)).expect(401);

    delete process.env['ACCESS_TOKEN_TTL_MINUTES'];
    const refreshed = await refreshWith(session.refresh).expect(200);
    const newRefresh = cookieValue(refreshed.headers['set-cookie'] as unknown as string[], 'forge_refresh');
    expect(newRefresh).toBeDefined();
    expect(newRefresh).not.toBe(session.refresh);
    await http().get('/auth/me').set(bearer(refreshed.body.token as string)).expect(200);
  }, 30_000);

  it('reapresentar o refresh anterior logo após a rotação é tolerado (sem revogar); fora da janela revoga a sessão', async () => {
    const session = await login('dev@auth-e2e.example');
    const first = await refreshWith(session.refresh).expect(200);
    const accessAfter = first.body.token as string;

    // dentro da janela de tolerância (duas abas renovando juntas): 401, mas a sessão segue viva
    await refreshWith(session.refresh).expect(401);
    await http().get('/auth/me').set(bearer(accessAfter)).expect(200);

    // fora da janela: sinal de roubo — a sessão inteira é revogada
    await testApp.db
      .update(testApp.schema.userSessions)
      .set({ rotatedAt: new Date(Date.now() - 60_000) })
      .where((await import('@forge/database')).eq(testApp.schema.userSessions.userId, devId));
    await refreshWith(session.refresh).expect(401);
    await http().get('/auth/me').set(bearer(accessAfter)).expect(401);
    const newRefresh = cookieValue(first.headers['set-cookie'] as unknown as string[], 'forge_refresh') ?? '';
    await refreshWith(newRefresh).expect(401);

    const audits = await testApp.db.query.auditLogs.findMany({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgId), eq(table.action, 'auth.refresh_reuse_detected')),
    });
    expect(audits.length).toBeGreaterThan(0);
  });

  it('refresh sem cookie ou com token inválido é 401', async () => {
    await http().post('/auth/refresh').expect(401);
    await refreshWith('token-que-nao-existe').expect(401);
  });

  it('logout revoga a sessão: o acesso e o refresh deixam de valer', async () => {
    const session = await login('dev@auth-e2e.example');
    await http()
      .post('/auth/logout')
      .set('Cookie', `forge_refresh=${session.refresh}`)
      .set(bearer(session.token))
      .expect(204);
    await http().get('/auth/me').set(bearer(session.token)).expect(401);
    await refreshWith(session.refresh).expect(401);
  });

  it('tokens sem sid, de desafio 2FA ou de usuário removido não autenticam', async () => {
    const jwt = testApp.app.get(JwtService);
    const legacy = jwt.sign({ sub: devId, organizationId: orgId, role: 'admin' });
    await http().get('/auth/me').set(bearer(legacy)).expect(401);
    const challenge = jwt.sign({ sub: devId, purpose: '2fa-challenge' });
    await http().get('/auth/me').set(bearer(challenge)).expect(401);

    const gone = await login('gone@auth-e2e.example');
    await http().get('/auth/me').set(bearer(gone.token)).expect(200);
    await testApp.db
      .delete(testApp.schema.users)
      .where((await import('@forge/database')).eq(testApp.schema.users.email, 'gone@auth-e2e.example'));
    await http().get('/auth/me').set(bearer(gone.token)).expect(401);
  });

  it('o papel vem do banco a cada requisição: rebaixar vale imediatamente', async () => {
    const admin = await login('admin@auth-e2e.example');
    await http().get('/members').set(bearer(admin.token)).expect(200);
    const { eq } = await import('@forge/database');
    await testApp.db.update(testApp.schema.users).set({ role: 'developer' }).where(eq(testApp.schema.users.email, 'admin@auth-e2e.example'));
    await http().get('/members').set(bearer(admin.token)).expect(403);
    await testApp.db.update(testApp.schema.users).set({ role: 'admin' }).where(eq(testApp.schema.users.email, 'admin@auth-e2e.example'));
  });
});

describe('gerenciamento de sessões', () => {
  it('lista as sessões, marca a atual e encerra outra (que deixa de funcionar)', async () => {
    const first = await login('lock@auth-e2e.example');
    const second = await login('lock@auth-e2e.example');
    const list = await http().get('/auth/sessions').set(bearer(second.token)).expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body.filter((item: { current: boolean }) => item.current)).toHaveLength(1);

    const other = list.body.find((item: { current: boolean }) => !item.current);
    await http().delete(`/auth/sessions/${other.id}`).set(bearer(second.token)).expect(204);
    await http().get('/auth/me').set(bearer(first.token)).expect(401);
    await http().get('/auth/me').set(bearer(second.token)).expect(200);
    await http().delete('/auth/sessions/nao-e-uuid').set(bearer(second.token)).expect(404);
    await http().delete('/auth/sessions/00000000-0000-4000-8000-000000000000').set(bearer(second.token)).expect(404);
  });

  it('encerrar todas as outras mantém só a atual', async () => {
    const a = await login('lock@auth-e2e.example');
    const b = await login('lock@auth-e2e.example');
    const c = await login('lock@auth-e2e.example');
    const response = await http().delete('/auth/sessions').set(bearer(c.token)).expect(200);
    expect(response.body.revoked).toBeGreaterThanOrEqual(2);
    await http().get('/auth/me').set(bearer(a.token)).expect(401);
    await http().get('/auth/me').set(bearer(b.token)).expect(401);
    await http().get('/auth/me').set(bearer(c.token)).expect(200);
  });

  it('conta de demonstração: só enxerga a própria sessão e não encerra as de outros visitantes', async () => {
    const visitorA = await login('demo@acme-platform.example');
    const visitorB = await login('demo@acme-platform.example');
    const list = await http().get('/auth/sessions').set(bearer(visitorB.token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].current).toBe(true);
    await http().delete('/auth/sessions').set(bearer(visitorB.token)).expect(403);
    await http().get('/auth/me').set(bearer(visitorA.token)).expect(200);
  });
});

describe('limite de tentativas de login', () => {
  it('bloqueia após 5 falhas (429, mesmo com a senha certa) e sucesso zera a contagem', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await http().post('/auth/login').send({ email: 'lock@auth-e2e.example', password: 'senha-errada-1' }).expect(401);
    }
    await login('lock@auth-e2e.example'); // sucesso zera

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http().post('/auth/login').send({ email: 'lock@auth-e2e.example', password: 'senha-errada-1' }).expect(401);
    }
    const blocked = await http().post('/auth/login').send({ email: 'lock@auth-e2e.example', password }).expect(429);
    expect(blocked.body.message).toContain('Muitas tentativas');
  });

  it('e-mail inexistente também conta (não revela se existe) e contas de demonstração nunca travam', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http().post('/auth/login').send({ email: 'ninguem@auth-e2e.example', password: 'senha-errada-1' }).expect(401);
    }
    await http().post('/auth/login').send({ email: 'ninguem@auth-e2e.example', password: 'senha-errada-1' }).expect(429);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await http().post('/auth/login').send({ email: 'demo@acme-platform.example', password: 'senha-errada-1' }).expect(401);
    }
    await login('demo@acme-platform.example');
  });
});

describe('2FA TOTP', () => {
  const email = 'two@auth-e2e.example';

  it('setup → confirmação → login em dois passos → replay recusado → recuperação → desativação', async () => {
    const session = await login(email);
    const setup = await http().post('/auth/2fa/setup').set(bearer(session.token)).expect(200);
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/u);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');

    const stored = await testApp.db.query.users.findFirst({ where: (table, { eq }) => eq(table.email, email) });
    expect(stored?.totpSecretEnc).toBeTruthy();
    expect(stored?.totpSecretEnc).not.toContain(setup.body.secret);
    expect(stored?.totpEnabledAt).toBeNull(); // pendente: login segue sem 2FA

    await http().post('/auth/2fa/enable').set(bearer(session.token)).send({ code: '000000' }).expect(401);
    // código do passo anterior: aceito na janela e deixa o passo atual livre para o login
    const enable = await http()
      .post('/auth/2fa/enable')
      .set(bearer(session.token))
      .send({ code: generateTotp(setup.body.secret as string, Date.now() - 30_000) })
      .expect(200);
    const recoveryCodes = enable.body.recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(8);
    await http().post('/auth/2fa/setup').set(bearer(session.token)).expect(409);
    const status = await http().get('/auth/2fa').set(bearer(session.token)).expect(200);
    expect(status.body).toEqual({ enabled: true, recoveryCodesRemaining: 8 });

    // login agora pede o segundo fator e não emite cookies
    const challenge = await http().post('/auth/login').send({ email, password }).expect(200);
    expect(challenge.body.twoFactorRequired).toBe(true);
    expect(challenge.headers['set-cookie']).toBeUndefined();
    const challengeToken = challenge.body.challengeToken as string;

    await http().post('/auth/2fa/verify').send({ challengeToken, code: '000000' }).expect(401);
    const code = generateTotp(setup.body.secret as string, Date.now());
    const verified = await http().post('/auth/2fa/verify').send({ challengeToken, code }).expect(200);
    expect(verified.body.token).toBeDefined();
    await http().get('/auth/me').set(bearer(verified.body.token as string)).expect(200);

    // o mesmo código não vale duas vezes
    await http().post('/auth/2fa/verify').send({ challengeToken, code }).expect(401);

    // código de recuperação: uso único
    const recovery = recoveryCodes[0] ?? '';
    await http().post('/auth/2fa/verify').send({ challengeToken, code: recovery }).expect(200);
    await http().post('/auth/2fa/verify').send({ challengeToken, code: recovery }).expect(401);
    const after = await http().get('/auth/2fa').set(bearer(verified.body.token as string)).expect(200);
    expect(after.body.recoveryCodesRemaining).toBe(7);

    // token de desafio não serve como sessão e token qualquer não serve como desafio
    await http().get('/auth/me').set(bearer(challengeToken)).expect(401);
    await http().post('/auth/2fa/verify').send({ challengeToken: verified.body.token, code }).expect(401);

    // desativar exige senha E código
    await http().post('/auth/2fa/disable').set(bearer(verified.body.token as string)).send({ password: 'senha-errada-1', code: recoveryCodes[1] }).expect(401);
    await http().post('/auth/2fa/disable').set(bearer(verified.body.token as string)).send({ password, code: recoveryCodes[1] }).expect(204);
    const plain = await http().post('/auth/login').send({ email, password }).expect(200);
    expect(plain.body.token).toBeDefined();

    const audits = await testApp.db.query.auditLogs.findMany({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgId), eq(table.actorUserId, stored?.id ?? '')),
    });
    const actions = audits.map((row) => row.action);
    expect(actions).toContain('auth.2fa_enabled');
    expect(actions).toContain('auth.2fa_disabled');
  }, 60_000);

  it('contas de demonstração não podem ativar 2FA (travaria os outros visitantes)', async () => {
    const session = await login('demo@acme-platform.example');
    await http().post('/auth/2fa/setup').set(bearer(session.token)).expect(403);
    await http().post('/auth/2fa/enable').set(bearer(session.token)).send({ code: '123456' }).expect(403);
  });

  it('exige autenticação e valida o corpo', async () => {
    await http().get('/auth/2fa').expect(401);
    await http().post('/auth/2fa/setup').expect(401);
    await http().post('/auth/2fa/verify').send({}).expect(400);
  });
});

describe('cabeçalhos de segurança', () => {
  it('toda resposta traz nosniff, sem moldura, sem referrer e CSP fechada; /auth não é cacheado', async () => {
    const response = await http().get('/auth/me');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('convites públicos', () => {
  it('limita consultas/aceites por IP (429 depois de 30 por minuto)', async () => {
    let last = 0;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      last = (await http().get('/invitations/lookup/token-inexistente-qualquer')).status;
    }
    expect(last).toBe(429);
  });
});
