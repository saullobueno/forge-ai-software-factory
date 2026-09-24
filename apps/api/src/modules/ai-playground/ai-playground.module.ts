import { Module } from '@nestjs/common';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AIPlaygroundController } from './ai-playground.controller.js';
import { AIPlaygroundService } from './ai-playground.service.js';

@Module({
  imports: [AuthModule, AuditLogWriterModule],
  controllers: [AIPlaygroundController],
  providers: [AIPlaygroundService],
  exports: [AIPlaygroundService],
})
export class AIPlaygroundModule {}
