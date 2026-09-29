import { cosineSimilarity, embedText, splitTerms } from './embedding.ts';
import { hasPromptInjectionRisk } from './prompt-injection.ts';
import type { KnowledgeDocument, KnowledgeRetrievalScope, RetrievedKnowledgeChunk } from './types.ts';

export interface RetrieveKnowledgeInput {
  documents: readonly KnowledgeDocument[];
  query: string;
  scope: KnowledgeRetrievalScope;
  limit?: number;
}

/**
 * Pesos da combinação híbrida (média ponderada, somam 1): o lexical
 * continua sendo o sinal PRIMÁRIO (0.7) — é ele que decide se um chunk
 * entra ou não no resultado (`chunk.score > 0` abaixo continua exigindo
 * pelo menos um termo exato da query, exatamente como antes desta
 * continuação); o semântico (0.3, similaridade de cosseno entre os
 * embeddings determinísticos de `embedText`) só refina a ORDEM entre
 * candidatos que já bateram no filtro lexical — nunca traz para o
 * resultado um chunk sem nenhuma correspondência exata de termo, porque o
 * "hashing trick" (ver `embedding.ts`) não entende sinonímia real, só
 * similaridade lexical vetorizada; tratá-lo como sinal secundário de
 * desempate/refinamento é a leitura honesta do que ele de fato mede.
 */
const LEXICAL_WEIGHT = 0.7;
const SEMANTIC_WEIGHT = 0.3;

export function retrieveKnowledge(input: RetrieveKnowledgeInput): RetrievedKnowledgeChunk[] {
  const queryTerms = tokenize(input.query);
  if (queryTerms.size === 0) return [];
  const queryEmbedding = embedText(input.query);

  return input.documents
    .filter((document) => isInScope(document, input.scope))
    .map((document): RetrievedKnowledgeChunk => {
      const contentTerms = tokenize(`${document.title}\n${document.content}`);
      const score = [...queryTerms].reduce((total, term) => total + (contentTerms.has(term) ? 1 : 0), 0);
      const lexicalRatio = score / queryTerms.size;
      // Cosseno negativo entre dois vetores de "hashing trick" não significa
      // "significado oposto" (não há essa noção aqui) — é só ruído de
      // colisão/sinal. Clampado em 0 para nunca PUNIR um chunk por isso, só
      // deixar de recompensá-lo.
      const semanticScore = document.embedding ? Math.max(0, cosineSimilarity(queryEmbedding, document.embedding)) : 0;
      const hybridScore = LEXICAL_WEIGHT * lexicalRatio + SEMANTIC_WEIGHT * semanticScore;
      return {
        sourceId: document.sourceId,
        title: document.title,
        uri: document.uri,
        kind: document.kind,
        projectId: document.projectId,
        workspaceId: document.workspaceId,
        content: document.content,
        chunkIndex: document.chunkIndex ?? 0,
        score,
        semanticScore,
        hybridScore,
        hasPromptInjectionRisk: hasPromptInjectionRisk(document.content),
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.hybridScore - a.hybridScore || b.score - a.score || a.title.localeCompare(b.title))
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
  return new Set(splitTerms(content));
}
