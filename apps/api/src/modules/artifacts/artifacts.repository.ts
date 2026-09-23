import { Injectable } from '@nestjs/common';
import { and, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type TestArtifactRow = typeof schema.testArtifacts.$inferSelect;

type TestArtifactWithTestRun = TestArtifactRow & {
  testRun: typeof schema.testRuns.$inferSelect;
};

/**
 * Camada de acesso a dados para TestArtifact (Fase 6). `testArtifacts` não
 * tem `organizationId` próprio (spec §16) — o tenant scoping passa sempre
 * pelo `testRun` dono do artefato, que tem `organizationId` direto (ver
 * `packages/database/src/schema/testing.ts`). Mesmo padrão de tenant
 * scoping das outras `*Repository` do módulo: `organizationId` faz parte
 * do próprio `WHERE`, nunca uma checagem posterior em memória.
 */
@Injectable()
export class ArtifactsRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Todo artefato de todo `testRun` ligado a este `agentRun` (uma execução
   * pode gerar mais de um `testRun` — spec §12; hoje o seed demo cria só
   * um, mas o endpoint não assume isso).
   */
  async listForAgentRun(agentRunId: string, organizationId: string): Promise<TestArtifactRow[]> {
    const runs = await this.database.db.query.testRuns.findMany({
      where: and(eq(schema.testRuns.agentRunId, agentRunId), eq(schema.testRuns.organizationId, organizationId)),
      with: { artifacts: true },
    });
    return runs.flatMap((run) => run.artifacts);
  }

  async findByIdWithTestRun(artifactId: string): Promise<TestArtifactWithTestRun | undefined> {
    return this.database.db.query.testArtifacts.findFirst({
      where: eq(schema.testArtifacts.id, artifactId),
      with: { testRun: true },
    });
  }
}
