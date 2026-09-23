import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, schema } from '@forge/database';
import { verifyPassword } from '@forge/domain';
import { userSchema, type LoginRequest, type LoginResponse, type User } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Mensagem única para qualquer falha de autenticação (email inexistente,
 * conta sem senha configurada, senha errada). Nunca revela qual dos casos
 * ocorreu — evita account enumeration (Fase 2, briefing §1).
 */
const GENERIC_AUTH_ERROR = 'Credenciais inválidas.';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginRequest): Promise<LoginResponse> {
    const row = await this.database.db.query.users.findFirst({
      where: eq(schema.users.email, input.email),
    });

    if (!row || !row.passwordHash) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const passwordMatches = await verifyPassword(input.password, row.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const token = await this.jwtService.signAsync({
      sub: row.id,
      organizationId: row.organizationId,
      role: row.role,
    });

    // userSchema.parse descarta passwordHash (campo não declarado no
    // schema) junto com qualquer outro campo de persistência que não
    // deva viajar para o cliente.
    return { token, user: userSchema.parse(row) };
  }

  async findAuthenticatedUser(userId: string): Promise<User> {
    const row = await this.database.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!row) {
      // O usuário do token pode ter sido removido depois de emitido —
      // trata como não autenticado, mesma mensagem genérica.
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    return userSchema.parse(row);
  }
}
