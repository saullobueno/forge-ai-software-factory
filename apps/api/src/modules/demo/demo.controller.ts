import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { DemoService } from './demo.service.js';

@Controller('demo')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DemoController {
  constructor(
    private readonly demoService: DemoService,
    private readonly authService: AuthService,
  ) {}

  /** A tela de Configurações só mostra o botão para quem pode resetar. */
  @Get('status')
  @RequirePermission('member:manage')
  async status(@CurrentUser() user: AuthenticatedUser) {
    const row = await this.authService.requireUser(user.userId);
    return { resettable: this.demoService.isResettable(row) };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('member:manage')
  async reset(@CurrentUser() user: AuthenticatedUser) {
    const row = await this.authService.requireUser(user.userId);
    return this.demoService.reset(row, user.sessionId);
  }
}
