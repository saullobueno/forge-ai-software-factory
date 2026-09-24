import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeRepository } from './knowledge.repository.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeRepository, KnowledgeService],
})
export class KnowledgeModule {}
