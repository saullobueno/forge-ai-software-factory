import type { KnowledgeSourceKind } from '@forge/types';

export interface KnowledgeDocument {
  sourceId: string;
  organizationId: string;
  projectId: string | null;
  workspaceId: string | null;
  kind: KnowledgeSourceKind;
  title: string;
  uri: string;
  version: string | null;
  content: string;
}

export interface KnowledgeChunkInput {
  sourceId: string;
  content: string;
  maxTokens?: number;
  overlapTokens?: number;
}

export interface PreparedKnowledgeChunk {
  knowledgeSourceId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  hasPromptInjectionRisk: boolean;
}

export interface RetrievedKnowledgeChunk {
  sourceId: string;
  title: string;
  uri: string;
  kind: KnowledgeSourceKind;
  projectId: string | null;
  workspaceId: string | null;
  content: string;
  chunkIndex: number;
  score: number;
  hasPromptInjectionRisk: boolean;
}

export interface KnowledgeRetrievalScope {
  organizationId: string;
  projectId?: string | null;
  workspaceId?: string | null;
}
