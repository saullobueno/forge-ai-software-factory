import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '@forge/domain';
import type {
  AcceptInvitationRequest,
  CreatedInvitation,
  CreateInvitationRequest,
  InvitationLookup,
  InvitationStatus,
  InvitationView,
  MemberRole,
  MemberView,
} from '@forge/types';
import { isProtectedUserEmail } from '../../infrastructure/config/env.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { MembersRepository, type InvitationRow, type MemberRow } from './members.repository.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVALID_INVITATION_MESSAGE = 'Convite inválido, expirado ou já utilizado.';
const PROTECTED_MEMBER_MESSAGE = 'Contas de demonstração não podem ser alteradas nem removidas.';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class MembersService {
  constructor(
    private readonly membersRepository: MembersRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private toMemberView(row: MemberRow): MemberView {
    return { ...row, isProtected: isProtectedUserEmail(row.email) };
  }

  private invitationStatus(row: InvitationRow): InvitationStatus {
    if (row.acceptedAt) return 'accepted';
    if (row.revokedAt) return 'revoked';
    return row.expiresAt.getTime() <= Date.now() ? 'expired' : 'pending';
  }

  private toInvitationView(row: InvitationRow): InvitationView {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: this.invitationStatus(row),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listMembers(organizationId: string): Promise<MemberView[]> {
    return (await this.membersRepository.listMembers(organizationId)).map((row) => this.toMemberView(row));
  }

  async changeRole(id: string, organizationId: string, actorUserId: string, role: MemberRole): Promise<MemberView> {
    const member = await this.membersRepository.findMember(id, organizationId);
    if (!member) throw new NotFoundException('Membro não encontrado.');
    if (isProtectedUserEmail(member.email)) throw new ForbiddenException(PROTECTED_MEMBER_MESSAGE);
    if (member.id === actorUserId) throw new ConflictException('Você não pode alterar o seu próprio papel.');
    if (member.role === 'admin' && role !== 'admin' && (await this.membersRepository.countAdmins(organizationId)) <= 1) {
      throw new ConflictException('A organização precisa manter ao menos um administrador.');
    }

    const updated = await this.membersRepository.updateRole(id, organizationId, role);
    if (!updated) throw new NotFoundException('Membro não encontrado.');
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'member.role_changed',
      targetType: 'user',
      targetId: id,
      metadata: { email: member.email, from: member.role, to: role },
    });
    return this.toMemberView(updated);
  }

  async removeMember(id: string, organizationId: string, actorUserId: string): Promise<void> {
    const member = await this.membersRepository.findMember(id, organizationId);
    if (!member) throw new NotFoundException('Membro não encontrado.');
    if (isProtectedUserEmail(member.email)) throw new ForbiddenException(PROTECTED_MEMBER_MESSAGE);
    if (member.id === actorUserId) throw new ConflictException('Você não pode remover a si mesmo.');
    if (member.role === 'admin' && (await this.membersRepository.countAdmins(organizationId)) <= 1) {
      throw new ConflictException('A organização precisa manter ao menos um administrador.');
    }

    await this.membersRepository.deleteMember(id, organizationId);
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'member.removed',
      targetType: 'user',
      targetId: id,
      metadata: { email: member.email, role: member.role },
    });
  }

  async listInvitations(organizationId: string): Promise<InvitationView[]> {
    return (await this.membersRepository.listInvitations(organizationId)).map((row) => this.toInvitationView(row));
  }

  async createInvitation(
    organizationId: string,
    actorUserId: string,
    input: CreateInvitationRequest,
  ): Promise<CreatedInvitation> {
    if (await this.membersRepository.emailTaken(input.email)) {
      throw new ConflictException('Já existe um usuário com este e-mail.');
    }

    await this.membersRepository.revokePendingForEmail(organizationId, input.email);
    const token = randomBytes(32).toString('base64url');
    const row = await this.membersRepository.createInvitation({
      organizationId,
      email: input.email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedByUserId: actorUserId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'invitation.created',
      targetType: 'invitation',
      targetId: row.id,
      metadata: { email: row.email, role: row.role },
    });
    return { ...this.toInvitationView(row), token };
  }

  async revokeInvitation(id: string, organizationId: string, actorUserId: string): Promise<void> {
    const row = await this.membersRepository.findInvitation(id, organizationId);
    if (!row) throw new NotFoundException('Convite não encontrado.');
    if (this.invitationStatus(row) !== 'pending') throw new ConflictException('Só convites pendentes podem ser revogados.');

    await this.membersRepository.revokeInvitation(id, organizationId);
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'invitation.revoked',
      targetType: 'invitation',
      targetId: id,
      metadata: { email: row.email },
    });
  }

  private async requirePendingInvitation(token: string): Promise<InvitationRow> {
    const row = await this.membersRepository.findInvitationByTokenHash(hashToken(token));
    if (!row || this.invitationStatus(row) !== 'pending') throw new NotFoundException(INVALID_INVITATION_MESSAGE);
    return row;
  }

  async lookupInvitation(token: string): Promise<InvitationLookup> {
    const row = await this.requirePendingInvitation(token);
    return {
      email: row.email,
      role: row.role,
      organizationName: await this.membersRepository.organizationName(row.organizationId),
    };
  }

  async acceptInvitation(input: AcceptInvitationRequest): Promise<{ email: string }> {
    const invitation = await this.requirePendingInvitation(input.token);
    if (await this.membersRepository.emailTaken(invitation.email)) {
      throw new ConflictException('Já existe um usuário com este e-mail.');
    }

    const member = await this.membersRepository.acceptInvitation({
      invitation,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    });
    if (!member) throw new BadRequestException(INVALID_INVITATION_MESSAGE);

    await this.auditLogsService.record({
      organizationId: invitation.organizationId,
      actorType: 'user',
      actorUserId: member.id,
      action: 'invitation.accepted',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });
    return { email: member.email };
  }
}
