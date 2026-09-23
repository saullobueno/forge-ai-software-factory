import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@forge/types';

export const REQUIRED_PERMISSION_KEY = 'forge:required_permission';

/**
 * Declara a permissão mínima (`@forge/domain` `hasPermission`) exigida
 * para um handler/controller. Avaliada por `PermissionsGuard` — precisa
 * rodar depois de `JwtAuthGuard` na lista de `@UseGuards(...)` para que
 * `request.user` já exista.
 */
export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
