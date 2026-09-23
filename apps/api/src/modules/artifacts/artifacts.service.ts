import { Injectable, NotFoundException } from '@nestjs/common';
import { ArtifactStorageService } from './artifact-storage.service.js';
import { ArtifactsRepository, type TestArtifactRow } from './artifacts.repository.js';

export interface ArtifactContentResult {
  id: string;
  name: string;
  kind: TestArtifactRow['kind'];
  content: string;
  sizeBytes: number;
}

/**
 * Fase 6 — persistência de artefatos (spec §9/§12). Orquestra o registro no
 * banco (`ArtifactsRepository`, tenant-scoped via o `testRun` dono) com a
 * leitura real em disco (`ArtifactStorageService`).
 */
@Injectable()
export class ArtifactsService {
  constructor(
    private readonly artifactsRepository: ArtifactsRepository,
    private readonly storage: ArtifactStorageService,
  ) {}

  async listForAgentRun(agentRunId: string, organizationId: string): Promise<TestArtifactRow[]> {
    return this.artifactsRepository.listForAgentRun(agentRunId, organizationId);
  }

  /**
   * `organizationId` é checado contra o `testRun` dono do artefato (não
   * existe `organizationId` direto em `testArtifacts`) — um artefato de
   * outra organização responde 404 genérico, nunca 403 (mesma regra de
   * cross-tenant do resto da API).
   */
  async getContent(artifactId: string, organizationId: string): Promise<ArtifactContentResult> {
    const artifact = await this.artifactsRepository.findByIdWithTestRun(artifactId);
    if (!artifact || artifact.testRun.organizationId !== organizationId) {
      throw new NotFoundException('Artefato não encontrado.');
    }

    const { content, sizeBytes } = await this.storage.readContent(artifact.storageKey);
    return { id: artifact.id, name: artifact.name, kind: artifact.kind, content, sizeBytes };
  }
}
