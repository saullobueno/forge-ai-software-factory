import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { ArtifactsController } from './artifacts.controller.js';
import { ArtifactsRepository } from './artifacts.repository.js';
import { ArtifactsService } from './artifacts.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsRepository, ArtifactsService, ArtifactStorageService],
  // Exportado para que `AgentRunsModule` reutilize `ArtifactsService` em
  // `GET /agent-runs/:id/artifacts` sem duplicar a camada de acesso a
  // dados/storage.
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
