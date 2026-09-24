import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditLogWriterModule } from './audit-log-writer.module.js';
import { AuditLogsController } from './audit-logs.controller.js';

@Module({
  imports: [AuthModule, AuditLogWriterModule],
  controllers: [AuditLogsController],
  exports: [AuditLogWriterModule],
})
export class AuditLogsModule {}
