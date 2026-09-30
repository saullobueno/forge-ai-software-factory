import { Module } from '@nestjs/common';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsRepository } from './agents.repository.js';
import { AgentsService } from './agents.service.js';

@Module({
  imports: [AuthModule, AuditLogWriterModule],
  controllers: [AgentsController],
  providers: [AgentsRepository, AgentsService],
  exports: [AgentsRepository],
})
export class AgentsModule {}
