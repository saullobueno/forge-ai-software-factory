import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AgentRunEventsService } from './agent-run-events.service.js';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentRunsRepository } from './agent-runs.repository.js';
import { AgentRunsService } from './agent-runs.service.js';

@Module({
  imports: [AgentsModule, AuthModule, ArtifactsModule],
  controllers: [AgentRunsController],
  providers: [AgentRunsRepository, AgentRunsService, AgentRunEventsService],
  // `AgentRunsService` continua exportado para `TasksModule` (disparo de
  // execução, Fase 4, e listagem por tarefa, Fase 6).
  exports: [AgentRunsService],
})
export class AgentRunsModule {}
