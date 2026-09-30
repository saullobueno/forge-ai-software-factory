import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, schema } from '@forge/database';
import type { MemberRole } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type MemberRow = Pick<typeof schema.users.$inferSelect, 'id' | 'name' | 'email' | 'role'>;
export type InvitationRow = typeof schema.invitations.$inferSelect;

const memberColumns = {
  id: schema.users.id,
  name: schema.users.name,
  email: schema.users.email,
  role: schema.users.role,
};

const toMember = (row: typeof schema.users.$inferSelect): MemberRow => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
});

/** Membros e convites da organização — sempre filtrados por `organizationId`. */
@Injectable()
export class MembersRepository {
  constructor(private readonly database: DatabaseService) {}

  async listMembers(organizationId: string): Promise<MemberRow[]> {
    return this.database.db
      .select(memberColumns)
      .from(schema.users)
      .where(eq(schema.users.organizationId, organizationId))
      .orderBy(asc(schema.users.name));
  }

  async findMember(id: string, organizationId: string): Promise<MemberRow | undefined> {
    const rows = await this.database.db
      .select(memberColumns)
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.organizationId, organizationId)))
      .limit(1);
    return rows[0];
  }

  async countAdmins(organizationId: string): Promise<number> {
    const rows = await this.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.organizationId, organizationId), eq(schema.users.role, 'admin')));
    return rows.length;
  }

  async updateRole(id: string, organizationId: string, role: MemberRole): Promise<MemberRow | undefined> {
    const rows = await this.database.db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(schema.users.id, id), eq(schema.users.organizationId, organizationId)))
      .returning();
    return rows[0] && toMember(rows[0]);
  }

  async deleteMember(id: string, organizationId: string): Promise<boolean> {
    const rows = await this.database.db
      .delete(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.organizationId, organizationId)))
      .returning();
    return rows.length > 0;
  }

  async emailTaken(email: string): Promise<boolean> {
    const rows = await this.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return rows.length > 0;
  }

  async listInvitations(organizationId: string): Promise<InvitationRow[]> {
    return this.database.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.organizationId, organizationId))
      .orderBy(desc(schema.invitations.createdAt));
  }

  async findInvitation(id: string, organizationId: string): Promise<InvitationRow | undefined> {
    const rows = await this.database.db
      .select()
      .from(schema.invitations)
      .where(and(eq(schema.invitations.id, id), eq(schema.invitations.organizationId, organizationId)))
      .limit(1);
    return rows[0];
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<InvitationRow | undefined> {
    const rows = await this.database.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, tokenHash))
      .limit(1);
    return rows[0];
  }

  async organizationName(organizationId: string): Promise<string> {
    const row = await this.database.db.query.organizations.findFirst({ where: eq(schema.organizations.id, organizationId) });
    return row?.name ?? '';
  }

  /** Revoga convites pendentes do mesmo e-mail (um convite vigente por e-mail). */
  async revokePendingForEmail(organizationId: string, email: string): Promise<void> {
    await this.database.db
      .update(schema.invitations)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.invitations.organizationId, organizationId),
          eq(schema.invitations.email, email),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
        ),
      );
  }

  async createInvitation(input: {
    organizationId: string;
    email: string;
    role: MemberRole;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
  }): Promise<InvitationRow> {
    const rows = await this.database.db.insert(schema.invitations).values(input).returning();
    const row = rows[0];
    if (!row) throw new Error('convite não inserido');
    return row;
  }

  async revokeInvitation(id: string, organizationId: string): Promise<void> {
    await this.database.db
      .update(schema.invitations)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.invitations.id, id), eq(schema.invitations.organizationId, organizationId)));
  }

  /** Cria o usuário e consome o convite numa transação (aceitar duas vezes é impossível). */
  async acceptInvitation(input: {
    invitation: InvitationRow;
    name: string;
    passwordHash: string;
  }): Promise<MemberRow | undefined> {
    const { invitation } = input;
    const consumed = await this.database.db
      .update(schema.invitations)
      .set({ acceptedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.invitations.id, invitation.id),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
        ),
      )
      .returning();
    if (consumed.length === 0) return undefined;

    const rows = await this.database.db
      .insert(schema.users)
      .values({
        organizationId: invitation.organizationId,
        email: invitation.email,
        name: input.name,
        role: invitation.role,
        passwordHash: input.passwordHash,
      })
      .returning();
    return rows[0] && toMember(rows[0]);
  }
}
