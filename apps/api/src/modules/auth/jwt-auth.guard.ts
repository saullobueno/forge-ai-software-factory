import { CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { env } from '../../infrastructure/config/env.js';
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
  constructor(private readonly jwtService: JwtService) {}

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
      request.user = {
        userId: payload.sub,
        organizationId: payload.organizationId,
        role: payload.role,
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
