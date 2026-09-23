import { Module } from '@nestjs/common';
import { createAiProvider } from '@forge/ai';
import { RepositoryFsService } from '../../infrastructure/repository-fs/repository-fs.service.js';
import { AgentsModule } from '../agents/agents.module.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AgentRunEventsService } from './agent-run-events.service.js';
import { AgentRunOrchestrationStore } from './agent-run-orchestration.store.js';
import { AgentRunWorkerService } from './agent-run-worker.service.js';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentRunsRepository } from './agent-runs.repository.js';
import { AgentRunsService } from './agent-runs.service.js';
import { AI_PROVIDER } from './ai-provider.token.js';

/**
 * `RepositoryFsService` é registrado aqui de propósito (não importado de
 * `CodeModule`): `CodeModule` importa `ProjectsModule`, que importa
 * `TasksModule`, que importa `AgentRunsModule` — importar `CodeModule`
 * aqui fecharia um ciclo. `RepositoryFsService` não tem estado próprio,
 * então registrá-lo em mais de um módulo é seguro (cada módulo recebe sua
 * própria instância stateless).
 */
@Module({
  imports: [AgentsModule, AuthModule, ArtifactsModule],
  controllers: [AgentRunsController],
  providers: [
    AgentRunsRepository,
    AgentRunsService,
    AgentRunEventsService,
    AgentRunOrchestrationStore,
    AgentRunWorkerService,
    RepositoryFsService,
    { provide: AI_PROVIDER, useFactory: () => createAiProvider() },
  ],
  // `AgentRunsService` continua exportado para `TasksModule` (disparo de
  // execução, Fase 4, e listagem por tarefa, Fase 6).
  exports: [AgentRunsService],
})
export class AgentRunsModule {}
