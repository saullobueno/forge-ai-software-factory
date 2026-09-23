import { Module } from '@nestjs/common';
import { RepositoryFsService } from '../../infrastructure/repository-fs/repository-fs.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { CodeController } from './code.controller.js';
import { CodeRepository } from './code.repository.js';
import { CodeService } from './code.service.js';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [CodeController],
  providers: [CodeRepository, CodeService, RepositoryFsService],
})
export class CodeModule {}
