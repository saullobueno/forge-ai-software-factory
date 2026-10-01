import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../infrastructure/config/env.js';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  imports: [
    AuditLogWriterModule,
    JwtModule.register({ secret: env.JWT_SECRET }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, JwtAuthGuard, PermissionsGuard],
  // Exportado para que outros módulos (ex.: ProjectsModule) reutilizem os
  // mesmos guards via DI em vez de reimplementar autenticação/RBAC.
  exports: [AuthService, SessionsService, JwtAuthGuard, PermissionsGuard, JwtModule],
})
export class AuthModule {}
