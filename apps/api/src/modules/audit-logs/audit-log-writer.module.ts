import { Module } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository.js';
import { AuditLogsService } from './audit-logs.service.js';

@Module({
  providers: [AuditLogsRepository, AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogWriterModule {}
