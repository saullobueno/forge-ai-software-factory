import { Injectable } from '@nestjs/common';
import { and, asc, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
  role: (typeof schema.users.$inferSelect)['role'];
  avatarUrl: string | null;
}

/** Acesso a dados de membros da organização (nunca expõe `passwordHash`). */
@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async listByOrganization(organizationId: string): Promise<OrganizationMember[]> {
    return this.database.db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      .where(eq(schema.users.organizationId, organizationId))
      .orderBy(asc(schema.users.name));
  }

  async existsInOrganization(userId: string, organizationId: string): Promise<boolean> {
    const rows = await this.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), eq(schema.users.organizationId, organizationId)))
      .limit(1);
    return rows.length > 0;
  }
}
