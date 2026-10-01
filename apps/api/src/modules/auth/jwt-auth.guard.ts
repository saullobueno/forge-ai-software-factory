import { CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { env } from '../../infrastructure/config/env.js';
import { SessionsService } from './sessions.service.js';
import type { AuthenticatedUser, JwtPayload } from './types.js';

const SESSION_COOKIE_NAME = 'forge_session';

/**
 * Autentica a requisição (spec Fase 2: "toda tool call deve verificar
 * identidade e escopo" — aqui aplicado a toda rota protegida). Aceita o
 * token via `Authorization: Bearer <token>` (chamadas de API/testes) ou
 * via cookie `forge_session` (`httpOnly`, ver `AuthController`). Em
 * qualquer falha (ausente, malformado, expirado, assinatura inválida),
 * responde com a mesma mensagem genérica — não distingue os casos para
 * quem chama.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser; cookies?: Record<string, string> }>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Não autenticado.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret: env.JWT_SECRET });
      if (!payload.sid || payload.purpose) throw new UnauthorizedException('Não autenticado.');

      // A sessão precisa estar ativa (não revogada nem vencida) e o papel/organização vêm do banco:
      // trocar o papel de alguém ou revogar a sessão vale na próxima requisição, não só quando o JWT vence.
      const active = await this.sessions.findActive(payload.sid);
      if (!active || active.user.id !== payload.sub) throw new UnauthorizedException('Não autenticado.');
      request.user = {
        userId: active.user.id,
        organizationId: active.user.organizationId,
        role: active.user.role,
        sessionId: active.session.id,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Não autenticado.');
    }
  }

  private extractToken(request: Request & { cookies?: Record<string, string> }): string | undefined {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return request.cookies?.[SESSION_COOKIE_NAME];
  }
}
