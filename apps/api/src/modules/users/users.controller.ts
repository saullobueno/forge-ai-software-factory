import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { UsersRepository } from './users.repository.js';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersRepository: UsersRepository) {}

  /** Membros da organização (para escolher responsável de tarefa etc.). */
  @Get()
  @RequirePermission('task:read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.usersRepository.listByOrganization(user.organizationId);
  }
}
