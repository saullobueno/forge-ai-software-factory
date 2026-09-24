import { Injectable } from '@nestjs/common';
import { hasPromptInjectionRisk, retrieveKnowledge, wrapUntrustedKnowledge } from '@forge/knowledge';
import type { KnowledgeSourceKind } from '@forge/types';
import { KnowledgeRepository, type KnowledgeSourceWithChunks } from './knowledge.repository.js';

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

@Injectable()
export class KnowledgeService {
  constructor(private readonly knowledgeRepository: KnowledgeRepository) {}

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
