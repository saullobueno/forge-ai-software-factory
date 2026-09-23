import { Module } from '@nestjs/common';
import { AgentsRepository } from './agents.repository.js';

@Module({
  providers: [AgentsRepository],
  exports: [AgentsRepository],
})
export class AgentsModule {}
