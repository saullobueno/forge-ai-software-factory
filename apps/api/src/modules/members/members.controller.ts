import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimiterService } from '../../infrastructure/rate-limit/rate-limiter.service.js';
import { getRolePermissions } from '@forge/domain';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  idSchema,
  memberRoleSchema,
  updateMemberRoleRequestSchema,
  type AcceptInvitationRequest,
  type CreateInvitationRequest,
  type UpdateMemberRoleRequest,
} from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { MembersService } from './members.service.js';

function requireId(id: string, message: string): string {
  if (!idSchema.safeParse(id).success) throw new NotFoundException(message);
  return id;
}

/** Configurações → Usuários e Convites (só quem tem `member:manage`). */
@Controller()
export class MembersController {
  constructor(
    private readonly membersService: MembersService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get('members')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('member:manage')
  async listMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.membersService.listMembers(user.organizationId);
  }

  /** Matriz papel x permissões (somente leitura; vem do RBAC de `@forge/domain`). */
  @Get('members/roles')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('member:manage')
  roles() {
    return memberRoleSchema.options.map((role) => ({ role, permissions: [...getRolePermissions(role)] }));
  }

  @Patch('members/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('member:manage')
  async changeRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberRoleRequestSchema)) body: UpdateMemberRoleRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.changeRole(requireId(id, 'Membro não encontrado.'), user.organizationId, user.userId, body.role);
  }

  @Delete('members/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('member:manage')
  async removeMember(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.membersService.removeMember(requireId(id, 'Membro não encontrado.'), user.organizationId, user.userId);
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('member:manage')
  async listInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.membersService.listInvitations(user.organizationId);
  }

  @Post('invitations')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('member:manage')
  async createInvitation(
    @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.createInvitation(user.organizationId, user.userId, body);
  }

  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('member:manage')
  async revokeInvitation(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.membersService.revokeInvitation(requireId(id, 'Convite não encontrado.'), user.organizationId, user.userId);
  }

  /** Público: a pessoa convidada ainda não tem conta. O token é a credencial. */
  @Get('invitations/lookup/:token')
  async lookup(@Param('token') token: string, @Req() request: Request) {
    this.rateLimiter.consume(`invite:${request.ip ?? 'unknown'}`, 30, 60_000);
    return this.membersService.lookupInvitation(token);
  }

  @Post('invitations/accept')
  async accept(@Body(new ZodValidationPipe(acceptInvitationRequestSchema)) body: AcceptInvitationRequest, @Req() request: Request) {
    this.rateLimiter.consume(`invite:${request.ip ?? 'unknown'}`, 30, 60_000);
    return this.membersService.acceptInvitation(body);
  }
}
