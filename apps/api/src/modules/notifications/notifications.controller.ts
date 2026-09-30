import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { idSchema } from '@forge/types';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { NotificationsService } from './notifications.service.js';

/** Notificações do próprio usuário (nunca de outro, mesmo na mesma organização). */
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermission('task:read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(user.organizationId, user.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('task:read')
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notificationsService.markAllRead(user.organizationId, user.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('task:read')
  async read(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    const updated = await this.notificationsService.markRead(id, user.organizationId, user.userId);
    if (!updated) {
      throw new NotFoundException('Notificação não encontrada.');
    }
  }
}
