import { Module } from '@nestjs/common';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

@Module({
  imports: [AuthModule, AuditLogWriterModule, ProjectsModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
