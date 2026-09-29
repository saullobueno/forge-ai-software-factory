import { Injectable } from '@nestjs/common';
import {
  hasPromptInjectionRisk,
  indexKnowledgeFiles,
  isRepositoryKnowledgeFile,
  retrieveKnowledge,
  wrapUntrustedKnowledge,
  type IndexableFile,
} from '@forge/knowledge';
import type { KnowledgeSourceKind } from '@forge/types';
import { RepositoryFsService, type RepositoryFile } from '../../infrastructure/repository-fs/repository-fs.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { loadForgeProductKnowledgeFiles } from './forge-product-docs.js';
import { KnowledgeRepository, type KnowledgeSourceWithChunks, type RepositoryRow } from './knowledge.repository.js';

export interface KnowledgeSourceSummary {
  id: string;
  organizationId: string;
  projectId: string | null;
  workspaceId: string | null;
  kind: KnowledgeSourceKind;
  title: string;
  uri: string;
  version: string | null;
  chunkCount: number;
  totalTokens: number;
  riskyChunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeSearchResult {
  sourceId: string;
  title: string;
  uri: string;
  kind: KnowledgeSourceKind;
  projectId: string | null;
  workspaceId: string | null;
  content: string;
  wrappedContent: string;
  chunkIndex: number;
  score: number;
  hasPromptInjectionRisk: boolean;
}

export interface KnowledgeReindexResult {
  createdSources: number;
  updatedSources: number;
  unchangedSources: number;
  totalSources: number;
}

/**
 * `uriPrefix` fixo do conhecimento de organização (produto Forge, não um
 * projeto) — mesmo literal já usado pelo seed (`run-seed.ts`,
 * `ensureDemoKnowledge`) para que as duas rotas de indexação (seed e
 * reindex sob demanda) resolvam para a MESMA fonte via `(organizationId,
 * projectId: null, uri)`, nunca criando uma segunda linha para os mesmos
 * documentos.
 */
const FORGE_PRODUCT_URI_PREFIX = 'forge://forge-ai-software-factory';
const KNOWLEDGE_CHUNKING_OPTIONS = { maxTokens: 120, overlapTokens: 16 } as const;

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly repositoryFs: RepositoryFsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listSources(projectId: string, organizationId: string): Promise<KnowledgeSourceSummary[]> {
    const sources = await this.knowledgeRepository.listSourcesByProject(projectId, organizationId);
    return sources.map((source) => this.toSummary(source));
  }

  async search(
    projectId: string,
    organizationId: string,
    query: string,
    limit: number | undefined,
  ): Promise<KnowledgeSearchResult[]> {
    const documents = await this.knowledgeRepository.findDocumentsForRetrieval(projectId, organizationId);
    return retrieveKnowledge({
      documents,
      query,
      scope: { organizationId, projectId },
      limit,
    }).map((chunk) => ({
      ...chunk,
      wrappedContent: wrapUntrustedKnowledge(chunk.content),
    }));
  }

  /**
   * Reindex sob demanda (Fase 12, pendência explícita registrada no
   * `PROGRESS.md`): relê os arquivos reais por trás do conhecimento deste
   * projeto (o repositório configurado, quando existe, filtrado pela mesma
   * regra `isRepositoryKnowledgeFile` que o seed usa) e os documentos reais
   * de organização sobre o próprio Forge, e persiste via
   * `persistIndexedKnowledgeSources` — que agora detecta staleness real por
   * `contentHash`: fonte nova é criada, fonte cujo arquivo não mudou não é
   * tocada, fonte cujo arquivo mudou tem os chunks reescritos (nunca
   * duplicados). Nunca falha por falta de repositório configurado/fixture
   * em disco — degrada graciosamente para "só os documentos de
   * organização", mesmo raciocínio já usado em outros pontos do app para
   * "nada real para processar".
   */
  async reindex(projectId: string, organizationId: string, actorUserId: string): Promise<KnowledgeReindexResult> {
    const repository = await this.knowledgeRepository.findRepositoryForProject(projectId, organizationId);
    const [repositoryFiles, forgeProductFiles] = await Promise.all([
      repository ? this.loadRepositoryKnowledgeFiles(repository) : Promise.resolve<IndexableFile[]>([]),
      loadForgeProductKnowledgeFiles(),
    ]);

    const indexedSources = [
      ...(repository
        ? indexKnowledgeFiles(repositoryFiles, {
            organizationId,
            projectId,
            workspaceId: null,
            uriPrefix: `repo://${repository.name}`,
            version: null,
            ...KNOWLEDGE_CHUNKING_OPTIONS,
          })
        : []),
      ...indexKnowledgeFiles(forgeProductFiles, {
        organizationId,
        projectId: null,
        workspaceId: null,
        uriPrefix: FORGE_PRODUCT_URI_PREFIX,
        version: null,
        ...KNOWLEDGE_CHUNKING_OPTIONS,
      }),
    ];

    const persisted = await this.knowledgeRepository.persistReindexedSources(indexedSources);

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'knowledge.reindexed',
      targetType: 'project',
      targetId: projectId,
      metadata: {
        createdSources: persisted.createdSourceCount,
        updatedSources: persisted.updatedSourceCount,
        unchangedSources: persisted.unchangedSourceCount,
        totalSources: indexedSources.length,
      },
    });

    return {
      createdSources: persisted.createdSourceCount,
      updatedSources: persisted.updatedSourceCount,
      unchangedSources: persisted.unchangedSourceCount,
      totalSources: indexedSources.length,
    };
  }

  /**
   * Lê o repositório real do projeto (`fixtures/<repository.name>`, via
   * `RepositoryFsService` — mesma infra já usada por `CodeService` para
   * navegar/ler o mesmo diretório) e filtra pela mesma regra que o seed
   * usa (`isRepositoryKnowledgeFile`, `@forge/knowledge`), para que o
   * reindex nunca indexe um conjunto de arquivos diferente do que o seed
   * indexaria para o mesmo repositório. Repositório configurado mas sem
   * cópia real em disco (fixture ausente) degrada para "nenhum arquivo" —
   * não é um erro do reindex, só nada real para ler.
   */
  private async loadRepositoryKnowledgeFiles(repository: RepositoryRow): Promise<IndexableFile[]> {
    const root = this.repositoryFs.resolveRepositoryRoot(repository.name);
    try {
      await this.repositoryFs.ensureRepositoryExists(root);
    } catch {
      return [];
    }

    const files = await this.repositoryFs.listAllFiles(root);
    return files.filter((file: RepositoryFile) => isRepositoryKnowledgeFile(file.path)).map((file) => ({ path: file.path, content: file.content }));
  }

  private toSummary(source: KnowledgeSourceWithChunks): KnowledgeSourceSummary {
    return {
      id: source.id,
      organizationId: source.organizationId,
      projectId: source.projectId,
      workspaceId: source.workspaceId,
      kind: source.kind,
      title: source.title,
      uri: source.uri,
      version: source.version,
      chunkCount: source.chunks.length,
      totalTokens: source.chunks.reduce((total, chunk) => total + (chunk.tokenCount ?? 0), 0),
      riskyChunkCount: source.chunks.filter((chunk) => hasPromptInjectionRisk(chunk.content)).length,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }
}
