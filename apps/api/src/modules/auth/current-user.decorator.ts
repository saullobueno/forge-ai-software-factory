import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './types.js';

/**
 * Extrai `request.user` (populado por `JwtAuthGuard`). Uso: rotas
 * decoradas com `@CurrentUser()` sempre precisam de `@UseGuards(JwtAuthGuard)`
 * antes — este decorator não autentica nada sozinho, só lê o que o guard
 * já validou.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
