import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsRepository } from './projects.repository.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [AuthModule, TasksModule],
  controllers: [ProjectsController],
  providers: [ProjectsRepository, ProjectsService],
  // Exportado para que `CodeModule` (Fase 5) reutilize a mesma checagem de
  // tenant/existência de projeto usada aqui, sem duplicar a camada de
  // acesso a dados — mesmo motivo de `TasksModule` exportar `TasksService`.
  exports: [ProjectsService],
})
export class ProjectsModule {}
