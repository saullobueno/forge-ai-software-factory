import type { MemberRole } from '@forge/types';

/**
 * Payload assinado no JWT de sessão (Fase 2). Mínimo por design — qualquer
 * outro dado do usuário (nome, avatar...) é buscado no banco quando
 * necessário (ex.: `GET /auth/me`), nunca confiado às cegas a partir do
 * token para informações que podem mudar entre a emissão e o uso.
 */
export interface JwtPayload {
  sub: string;
  organizationId: string;
  role: MemberRole;
}

/**
 * Formato anexado a `request.user` por `JwtAuthGuard`, consumido por
 * `@CurrentUser()` e por `PermissionsGuard`.
 */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: MemberRole;
}
