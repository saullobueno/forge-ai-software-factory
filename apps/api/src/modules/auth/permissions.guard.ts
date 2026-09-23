import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '@forge/domain';
import type { Permission } from '@forge/types';
import { REQUIRED_PERMISSION_KEY } from './require-permission.decorator.js';
import type { AuthenticatedUser } from './types.js';

/**
 * RBAC de rota (spec Fase 2). Sem `@RequirePermission(...)` na rota, deixa
 * passar — nem toda rota protegida por `JwtAuthGuard` precisa de uma
 * permissão específica além de estar autenticado. Delega a decisão em si
 * para `hasPermission` de `@forge/domain` (matriz role -> Permission),
 * nunca reimplementa a regra aqui.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      // PermissionsGuard sempre deve rodar depois de JwtAuthGuard; chegar
      // aqui sem `user` é erro de composição de guards em algum
      // controller — nega por padrão (fail-closed) em vez de assumir.
      throw new UnauthorizedException('Não autenticado.');
    }

    if (!hasPermission(user.role, required)) {
      throw new ForbiddenException('Você não tem permissão para executar esta ação.');
    }

    return true;
  }
}
