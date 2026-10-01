import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, schema } from '@forge/database';
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyPassword,
  verifyTotp,
} from '@forge/domain';
import {
  userSchema,
  type AuthSessionView,
  type LoginRequest,
  type LoginResponse,
  type TwoFactorSetup,
  type TwoFactorStatus,
  type User,
} from '@forge/types';
import { isProtectedUserEmail } from '../../infrastructure/config/env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RateLimiterService } from '../../infrastructure/rate-limit/rate-limiter.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { decryptTotpSecret, encryptTotpSecret, readSessionTimes, sha256Hex } from './auth.config.js';
import { SessionsService, type SessionMeta, type SessionRow, type UserRow } from './sessions.service.js';

/**
 * Mensagem única para qualquer falha de autenticação (email inexistente,
 * conta sem senha configurada, senha errada). Nunca revela qual dos casos
 * ocorreu — evita account enumeration (Fase 2, briefing §1).
 */
const GENERIC_AUTH_ERROR = 'Credenciais inválidas.';
const INVALID_SECOND_FACTOR = 'Código de verificação inválido.';
const CHALLENGE_TTL_SECONDS = 5 * 60;

const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const SECOND_FACTOR_FAILURE_LIMIT = 8;
const SECOND_FACTOR_WINDOW_MS = 5 * 60 * 1000;

const DEMO_2FA_MESSAGE = 'Contas de demonstração não podem ativar verificação em duas etapas.';
const DEMO_SESSIONS_MESSAGE = 'Contas de demonstração compartilham o login: não é possível encerrar as sessões de outros visitantes.';

export type LoginOutcome =
  | { kind: 'session'; result: LoginResponse; refreshToken: string }
  | { kind: 'challenge'; challengeToken: string };

export interface AuthSessionIssue {
  result: LoginResponse;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly auditLogsService: AuditLogsService,
    private readonly sessions: SessionsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  private async findByEmail(email: string): Promise<UserRow | undefined> {
    return this.database.db.query.users.findFirst({ where: eq(schema.users.email, email) });
  }

  private async findById(userId: string): Promise<UserRow | undefined> {
    return this.database.db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  }

  private async signAccessToken(user: UserRow, sessionId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, organizationId: user.organizationId, role: user.role, sid: sessionId },
      { expiresIn: readSessionTimes().accessTtlSeconds },
    );
  }

  /** Cria a sessão revogável e o par de tokens (acesso curto + refresh rotativo). */
  private async issueSession(user: UserRow, meta: SessionMeta): Promise<AuthSessionIssue> {
    const { session, refreshToken } = await this.sessions.create(user, meta);
    const token = await this.signAccessToken(user, session.id);
    // userSchema.parse descarta passwordHash/segredos 2FA (campos não declarados no schema).
    return { result: { token, user: userSchema.parse(user) }, refreshToken };
  }

  async login(input: LoginRequest, meta: SessionMeta = {}): Promise<LoginOutcome> {
    const limited = !isProtectedUserEmail(input.email);
    const limitKey = `login:${input.email.toLowerCase()}`;
    // Demo: a senha é pública, então travar a conta só prejudicaria os visitantes.
    if (limited) {
      this.rateLimiter.assertBelow(limitKey, LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS, 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.');
    }

    const row = await this.findByEmail(input.email);

    if (!row) {
      // Email de verdade não existe: não há `organizationId` real para
      // escopar um audit log (`audit_logs.organization_id` é `NOT NULL`,
      // FK real para `organizations` — nunca um valor inventado). A
      // mensagem genérica já evita account enumeration; a falha também
      // conta para o limite, de modo que o bloqueio não revela se o e-mail existe.
      if (limited) this.rateLimiter.record(limitKey, LOGIN_FAILURE_WINDOW_MS);
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (!row.passwordHash) {
      if (limited) this.rateLimiter.record(limitKey, LOGIN_FAILURE_WINDOW_MS);
      await this.recordLoginAudit(row, 'auth.login_failed', { reason: 'no_password_configured' });
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const passwordMatches = await verifyPassword(input.password, row.passwordHash);
    if (!passwordMatches) {
      if (limited) this.rateLimiter.record(limitKey, LOGIN_FAILURE_WINDOW_MS);
      await this.recordLoginAudit(row, 'auth.login_failed', { reason: 'invalid_credentials' });
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    this.rateLimiter.reset(limitKey);

    if (row.totpEnabledAt) {
      const challengeToken = await this.jwtService.signAsync(
        { sub: row.id, purpose: '2fa-challenge' },
        { expiresIn: CHALLENGE_TTL_SECONDS },
      );
      return { kind: 'challenge', challengeToken };
    }

    const issued = await this.issueSession(row, meta);
    await this.recordLoginAudit(row, 'auth.login_succeeded');
    return { kind: 'session', ...issued };
  }

  /** Segundo passo do login: troca o `challengeToken` + código por uma sessão. */
  async verifySecondFactor(challengeToken: string, code: string, meta: SessionMeta = {}): Promise<AuthSessionIssue> {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub?: string; purpose?: string }>(challengeToken);
    } catch {
      throw new UnauthorizedException('Verificação expirada. Entre novamente.');
    }
    if (payload.purpose !== '2fa-challenge' || !payload.sub) throw new UnauthorizedException('Verificação inválida.');

    const user = await this.findById(payload.sub);
    if (!user || !user.totpEnabledAt) throw new UnauthorizedException('Verificação inválida.');

    const key = `2fa:${user.id}`;
    this.rateLimiter.assertBelow(key, SECOND_FACTOR_FAILURE_LIMIT, SECOND_FACTOR_WINDOW_MS, 'Muitas tentativas de verificação. Aguarde alguns minutos.');
    if (!(await this.consumeSecondFactor(user, code))) {
      this.rateLimiter.record(key, SECOND_FACTOR_WINDOW_MS);
      await this.recordLoginAudit(user, 'auth.login_failed', { reason: 'invalid_second_factor' });
      throw new UnauthorizedException(INVALID_SECOND_FACTOR);
    }
    this.rateLimiter.reset(key);

    const issued = await this.issueSession(user, meta);
    await this.recordLoginAudit(user, 'auth.login_succeeded', { secondFactor: true });
    return issued;
  }

  /** Renova o acesso com o refresh token (que é rotacionado). Reuso do token antigo revoga a sessão. */
  async refresh(refreshToken: string, meta: SessionMeta = {}): Promise<AuthSessionIssue> {
    const outcome = await this.sessions.rotate(refreshToken, meta);
    if (outcome.status === 'reused') {
      await this.auditLogsService.record({
        organizationId: outcome.session.organizationId,
        actorType: 'user',
        actorUserId: outcome.session.userId,
        action: 'auth.refresh_reuse_detected',
        targetType: 'session',
        targetId: outcome.session.id,
        metadata: { ip: meta.ipAddress ?? null },
      });
      throw new UnauthorizedException('Sessão encerrada por segurança. Entre novamente.');
    }
    if (outcome.status === 'invalid') throw new UnauthorizedException('Sessão expirada. Entre novamente.');

    const token = await this.signAccessToken(outcome.user, outcome.session.id);
    return { result: { token, user: userSchema.parse(outcome.user) }, refreshToken: outcome.refreshToken };
  }

  /** Encerra a sessão identificada pelo refresh token e/ou pelo id (idempotente, nunca lança). */
  async logout(refreshToken: string | undefined, sessionId: string | undefined): Promise<void> {
    let session: SessionRow | undefined;
    if (refreshToken) session = await this.sessions.revokeByRefreshToken(refreshToken, 'logout');
    if (sessionId && sessionId !== session?.id) await this.sessions.revoke(sessionId, 'logout');
  }

  async findAuthenticatedUser(userId: string): Promise<User> {
    const row = await this.findById(userId);

    if (!row) {
      // O usuário do token pode ter sido removido depois de emitido —
      // trata como não autenticado, mesma mensagem genérica.
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    return userSchema.parse(row);
  }

  // ---------- sessões

  async listSessions(user: UserRow, currentSessionId: string): Promise<AuthSessionView[]> {
    const rows = await this.sessions.listActive(user.id);
    // Contas de demonstração compartilham o login: não expõe IP/navegador de outros visitantes.
    const visible = isProtectedUserEmail(user.email) ? rows.filter((row) => row.id === currentSessionId) : rows;
    return visible.map((row) => ({
      id: row.id,
      current: row.id === currentSessionId,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
    }));
  }

  async revokeSession(user: UserRow, currentSessionId: string, sessionId: string): Promise<boolean> {
    const session = await this.sessions.findOwned(sessionId, user.id);
    if (!session) return false;
    if (session.id !== currentSessionId && isProtectedUserEmail(user.email)) throw new ForbiddenException(DEMO_SESSIONS_MESSAGE);
    await this.sessions.revoke(session.id, 'revoked_by_user');
    await this.auditLogsService.record({
      organizationId: user.organizationId,
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.session_revoked',
      targetType: 'session',
      targetId: session.id,
    });
    return true;
  }

  async revokeOtherSessions(user: UserRow, currentSessionId: string): Promise<number> {
    if (isProtectedUserEmail(user.email)) throw new ForbiddenException(DEMO_SESSIONS_MESSAGE);
    const count = await this.sessions.revokeOthers(user.id, currentSessionId, 'revoked_by_user');
    await this.auditLogsService.record({
      organizationId: user.organizationId,
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.other_sessions_revoked',
      targetType: 'user',
      targetId: user.id,
      metadata: { count },
    });
    return count;
  }

  async requireUser(userId: string): Promise<UserRow> {
    const row = await this.findById(userId);
    if (!row) throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    return row;
  }

  // ---------- 2FA (TOTP)

  async twoFactorStatus(user: UserRow): Promise<TwoFactorStatus> {
    return { enabled: user.totpEnabledAt !== null, recoveryCodesRemaining: user.recoveryCodeHashes.length };
  }

  async twoFactorSetup(user: UserRow): Promise<TwoFactorSetup> {
    if (isProtectedUserEmail(user.email)) throw new ForbiddenException(DEMO_2FA_MESSAGE);
    if (user.totpEnabledAt) throw new ConflictException('A verificação em duas etapas já está ativa.');

    const secret = generateTotpSecret();
    await this.database.db
      .update(schema.users)
      .set({ totpSecretEnc: encryptTotpSecret(secret), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    return { secret, otpauthUrl: buildOtpAuthUrl('Forge AI Software Factory', user.email, secret) };
  }

  /** Confirma o setup com um código do app e devolve os códigos de recuperação (uma única vez). */
  async twoFactorEnable(user: UserRow, code: string): Promise<{ recoveryCodes: string[] }> {
    if (isProtectedUserEmail(user.email)) throw new ForbiddenException(DEMO_2FA_MESSAGE);
    if (user.totpEnabledAt) throw new ConflictException('A verificação em duas etapas já está ativa.');
    if (!user.totpSecretEnc) throw new ConflictException('Inicie a configuração antes de confirmar o código.');

    const key = `2fa-enable:${user.id}`;
    this.rateLimiter.assertBelow(key, SECOND_FACTOR_FAILURE_LIMIT, SECOND_FACTOR_WINDOW_MS, 'Muitas tentativas. Aguarde alguns minutos.');
    const counter = verifyTotp(decryptTotpSecret(user.totpSecretEnc), code, Date.now());
    if (counter === null) {
      this.rateLimiter.record(key, SECOND_FACTOR_WINDOW_MS);
      throw new UnauthorizedException(INVALID_SECOND_FACTOR);
    }
    this.rateLimiter.reset(key);

    const recoveryCodes = generateRecoveryCodes(8);
    await this.database.db
      .update(schema.users)
      .set({
        totpEnabledAt: new Date(),
        totpLastCounter: counter,
        recoveryCodeHashes: recoveryCodes.map((item) => sha256Hex(item)),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));
    await this.auditLogsService.record({
      organizationId: user.organizationId,
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.2fa_enabled',
      targetType: 'user',
      targetId: user.id,
    });
    return { recoveryCodes };
  }

  async twoFactorDisable(user: UserRow, password: string, code: string): Promise<void> {
    if (!user.totpEnabledAt) throw new ConflictException('A verificação em duas etapas não está ativa.');
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }
    const key = `2fa-disable:${user.id}`;
    this.rateLimiter.assertBelow(key, SECOND_FACTOR_FAILURE_LIMIT, SECOND_FACTOR_WINDOW_MS, 'Muitas tentativas. Aguarde alguns minutos.');
    if (!(await this.consumeSecondFactor(user, code))) {
      this.rateLimiter.record(key, SECOND_FACTOR_WINDOW_MS);
      throw new UnauthorizedException(INVALID_SECOND_FACTOR);
    }
    this.rateLimiter.reset(key);

    await this.database.db
      .update(schema.users)
      .set({ totpSecretEnc: null, totpEnabledAt: null, totpLastCounter: null, recoveryCodeHashes: [], updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    await this.auditLogsService.record({
      organizationId: user.organizationId,
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.2fa_disabled',
      targetType: 'user',
      targetId: user.id,
    });
  }

  /**
   * Confere o segundo fator: código TOTP (nunca reaproveita um passo já aceito) ou um código de
   * recuperação (uso único). Persiste o consumo.
   */
  private async consumeSecondFactor(user: UserRow, rawCode: string): Promise<boolean> {
    const code = rawCode.trim();
    if (/^\d{3}\s?\d{3}$/u.test(code)) {
      if (!user.totpSecretEnc) return false;
      const counter = verifyTotp(decryptTotpSecret(user.totpSecretEnc), code, Date.now());
      if (counter === null || (user.totpLastCounter !== null && counter <= user.totpLastCounter)) return false;
      await this.database.db
        .update(schema.users)
        .set({ totpLastCounter: counter })
        .where(eq(schema.users.id, user.id));
      return true;
    }

    const hash = sha256Hex(code.toLowerCase());
    if (!user.recoveryCodeHashes.includes(hash)) return false;
    await this.database.db
      .update(schema.users)
      .set({ recoveryCodeHashes: user.recoveryCodeHashes.filter((item) => item !== hash) })
      .where(eq(schema.users.id, user.id));
    return true;
  }

  private async recordLoginAudit(
    user: typeof schema.users.$inferSelect,
    action: 'auth.login_succeeded' | 'auth.login_failed',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.auditLogsService.record({
      organizationId: user.organizationId,
      actorType: 'user',
      actorUserId: user.id,
      action,
      targetType: 'user',
      targetId: user.id,
      metadata: { role: user.role, ...metadata },
    });
  }
}
