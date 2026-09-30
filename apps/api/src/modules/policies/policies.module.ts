import { Module } from '@nestjs/common';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PoliciesController } from './policies.controller.js';
import { PoliciesRepository } from './policies.repository.js';
import { PoliciesService } from './policies.service.js';

@Module({
  imports: [AuthModule, AuditLogWriterModule],
  controllers: [PoliciesController],
  providers: [PoliciesRepository, PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
