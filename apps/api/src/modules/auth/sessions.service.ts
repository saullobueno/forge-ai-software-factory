import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { readSessionTimes, sha256Hex } from './auth.config.js';

export type SessionRow = typeof schema.userSessions.$inferSelect;
export type UserRow = typeof schema.users.$inferSelect;

export interface SessionMeta {
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
}

/** Janela em que reapresentar o refresh token anterior é tolerado (duas abas renovando juntas). */
const REUSE_GRACE_MS = 15_000;
/** Atualiza `lastUsedAt` no máximo a cada minuto (evita uma escrita por requisição). */
const TOUCH_INTERVAL_MS = 60_000;

export type RefreshResult =
  | { status: 'rotated'; session: SessionRow; user: UserRow; refreshToken: string }
  | { status: 'invalid' }
  | { status: 'reused'; session: SessionRow };

const newRefreshToken = (): string => randomBytes(32).toString('base64url');

/** Sessões de login revogáveis: o refresh token só existe aqui como hash; é rotativo, com detecção de reuso. */
@Injectable()
export class SessionsService {
  constructor(private readonly database: DatabaseService) {}

  async create(user: UserRow, meta: SessionMeta): Promise<{ session: SessionRow; refreshToken: string }> {
    const times = readSessionTimes();
    const refreshToken = newRefreshToken();
    const [session] = await this.database.db
      .insert(schema.userSessions)
      .values({
        organizationId: user.organizationId,
        userId: user.id,
        refreshTokenHash: sha256Hex(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ipAddress: meta.ipAddress?.slice(0, 80) ?? null,
        expiresAt: new Date(Date.now() + times.refreshTtlMs),
      })
      .returning();
    if (!session) throw new Error('sessão não criada');
    return { session, refreshToken };
  }

  /** Sessão ativa (não revogada, dentro da validade e do teto absoluto) + o usuário atual (papel sempre fresco). */
  async findActive(sessionId: string): Promise<{ session: SessionRow; user: UserRow } | undefined> {
    const rows = await this.database.db
      .select({ session: schema.userSessions, user: schema.users })
      .from(schema.userSessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
      .where(and(eq(schema.userSessions.id, sessionId), isNull(schema.userSessions.revokedAt)))
      .limit(1);
    const found = rows[0];
    if (!found) return undefined;
    const now = Date.now();
    const absoluteEnd = found.session.createdAt.getTime() + readSessionTimes().sessionMaxAgeMs;
    if (found.session.expiresAt.getTime() <= now || absoluteEnd <= now) return undefined;
    if (now - found.session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.database.db
        .update(schema.userSessions)
        .set({ lastUsedAt: new Date(now) })
        .where(eq(schema.userSessions.id, sessionId));
    }
    return found;
  }

  /**
   * Troca o refresh token por um novo (rotação). Apresentar o token ANTERIOR fora da janela de tolerância
   * é sinal de roubo: a sessão inteira é revogada.
   */
  async rotate(refreshToken: string, meta: SessionMeta): Promise<RefreshResult> {
    const hash = sha256Hex(refreshToken);
    const now = Date.now();

    const current = await this.database.db
      .select({ session: schema.userSessions, user: schema.users })
      .from(schema.userSessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
      .where(eq(schema.userSessions.refreshTokenHash, hash))
      .limit(1);
    const match = current[0];
    if (match) {
      const { session, user } = match;
      const absoluteEnd = session.createdAt.getTime() + readSessionTimes().sessionMaxAgeMs;
      if (session.revokedAt || session.expiresAt.getTime() <= now || absoluteEnd <= now) return { status: 'invalid' };

      const times = readSessionTimes();
      const next = newRefreshToken();
      const updated = await this.database.db
        .update(schema.userSessions)
        .set({
          refreshTokenHash: sha256Hex(next),
          previousRefreshTokenHash: hash,
          rotatedAt: new Date(now),
          lastUsedAt: new Date(now),
          expiresAt: new Date(Math.min(now + times.refreshTtlMs, absoluteEnd)),
          ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 300) } : {}),
          ...(meta.ipAddress ? { ipAddress: meta.ipAddress.slice(0, 80) } : {}),
        })
        // condição no hash: duas renovações simultâneas não geram dois tokens válidos
        .where(and(eq(schema.userSessions.id, session.id), eq(schema.userSessions.refreshTokenHash, hash)))
        .returning();
      if (updated.length === 0) return { status: 'invalid' };
      return { status: 'rotated', session: updated[0]!, user, refreshToken: next };
    }

    const reused = await this.database.db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.previousRefreshTokenHash, hash))
      .limit(1);
    const previous = reused[0];
    if (!previous || previous.revokedAt) return { status: 'invalid' };
    if (previous.rotatedAt && now - previous.rotatedAt.getTime() <= REUSE_GRACE_MS) return { status: 'invalid' };

    await this.revoke(previous.id, 'refresh_reuse');
    return { status: 'reused', session: previous };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.database.db
      .update(schema.userSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(schema.userSessions.id, sessionId), isNull(schema.userSessions.revokedAt)));
  }

  async revokeByRefreshToken(refreshToken: string, reason: string): Promise<SessionRow | undefined> {
    const rows = await this.database.db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.refreshTokenHash, sha256Hex(refreshToken)))
      .limit(1);
    const session = rows[0];
    if (session) await this.revoke(session.id, reason);
    return session;
  }

  async listActive(userId: string): Promise<SessionRow[]> {
    const now = new Date();
    return this.database.db
      .select()
      .from(schema.userSessions)
      .where(
        and(
          eq(schema.userSessions.userId, userId),
          isNull(schema.userSessions.revokedAt),
          gt(schema.userSessions.expiresAt, now),
        ),
      )
      .orderBy(desc(schema.userSessions.lastUsedAt));
  }

  async findOwned(sessionId: string, userId: string): Promise<SessionRow | undefined> {
    const rows = await this.database.db
      .select()
      .from(schema.userSessions)
      .where(and(eq(schema.userSessions.id, sessionId), eq(schema.userSessions.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async revokeOthers(userId: string, exceptSessionId: string, reason: string): Promise<number> {
    const rows = await this.database.db
      .update(schema.userSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(
        and(
          eq(schema.userSessions.userId, userId),
          ne(schema.userSessions.id, exceptSessionId),
          isNull(schema.userSessions.revokedAt),
        ),
      )
      .returning();
    return rows.length;
  }
}
