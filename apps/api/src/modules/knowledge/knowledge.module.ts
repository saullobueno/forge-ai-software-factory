import { Module } from '@nestjs/common';
import { RepositoryFsService } from '../../infrastructure/repository-fs/repository-fs.service.js';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeRepository } from './knowledge.repository.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  imports: [AuthModule, ProjectsModule, AuditLogWriterModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeRepository, KnowledgeService, RepositoryFsService],
})
export class KnowledgeModule {}
