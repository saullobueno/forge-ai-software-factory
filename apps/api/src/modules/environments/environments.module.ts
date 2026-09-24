import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { EnvironmentsController } from './environments.controller.js';
import { EnvironmentsRepository } from './environments.repository.js';
import { EnvironmentsService } from './environments.service.js';

@Module({
  imports: [AuthModule, ProjectsModule, AuditLogWriterModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsRepository, EnvironmentsService],
})
export class EnvironmentsModule {}
