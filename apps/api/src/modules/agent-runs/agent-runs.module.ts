import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AgentRunsRepository } from './agent-runs.repository.js';
import { AgentRunsService } from './agent-runs.service.js';

@Module({
  imports: [AgentsModule],
  providers: [AgentRunsRepository, AgentRunsService],
  exports: [AgentRunsService],
})
export class AgentRunsModule {}
