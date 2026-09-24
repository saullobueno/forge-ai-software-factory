import { hasPromptInjectionRisk } from './prompt-injection.ts';
import type { KnowledgeDocument, KnowledgeRetrievalScope, RetrievedKnowledgeChunk } from './types.ts';

export interface RetrieveKnowledgeInput {
  documents: readonly KnowledgeDocument[];
  query: string;
  scope: KnowledgeRetrievalScope;
  limit?: number;
}

export function retrieveKnowledge(input: RetrieveKnowledgeInput): RetrievedKnowledgeChunk[] {
  const queryTerms = tokenize(input.query);
  if (queryTerms.size === 0) return [];

  return input.documents
    .filter((document) => isInScope(document, input.scope))
    .map((document): RetrievedKnowledgeChunk => {
      const contentTerms = tokenize(`${document.title}\n${document.content}`);
      const score = [...queryTerms].reduce((total, term) => total + (contentTerms.has(term) ? 1 : 0), 0);
      return {
        sourceId: document.sourceId,
        title: document.title,
        uri: document.uri,
        kind: document.kind,
        projectId: document.projectId,
        workspaceId: document.workspaceId,
        content: document.content,
        chunkIndex: 0,
        score,
        hasPromptInjectionRisk: hasPromptInjectionRisk(document.content),
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, input.limit ?? 8);
}

function isInScope(document: KnowledgeDocument, scope: KnowledgeRetrievalScope): boolean {
  if (document.organizationId !== scope.organizationId) return false;
  if (scope.projectId !== undefined && document.projectId !== null && document.projectId !== scope.projectId) return false;
  if (scope.workspaceId !== undefined && document.workspaceId !== null && document.workspaceId !== scope.workspaceId) {
    return false;
  }
  return true;
}

function tokenize(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9_/-]+/)
      .filter((term) => term.length >= 3),
  );
}
