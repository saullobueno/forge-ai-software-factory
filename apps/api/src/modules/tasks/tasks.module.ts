import { Module } from '@nestjs/common';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [AuthModule, AgentRunsModule],
  controllers: [TasksController],
  providers: [TasksRepository, TasksService],
  // Exportado para que `ProjectsModule` reutilize `TasksService` em
  // `GET /projects/:id/tasks` sem duplicar a camada de acesso a dados.
  exports: [TasksService],
})
export class TasksModule {}
