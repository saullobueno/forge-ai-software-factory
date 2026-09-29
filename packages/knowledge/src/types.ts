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
  chunkIndex?: number;
  /**
   * Embedding determinístico local do chunk (`embedText`, `embedding.ts`),
   * calculado na hora da persistência (ver `chunkKnowledge`). `undefined`/
   * `null` para chunks legados persistidos antes desta coluna existir, ou
   * nunca reindexados desde então — `retrieveKnowledge()` degrada
   * graciosamente para o score puramente lexical nesse caso, sem erro.
   */
  embedding?: number[] | null;
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
  /**
   * Opcional (não `undefined` só por descuido): permite que consumidores que
   * constroem `PreparedKnowledgeChunk` manualmente (ex. fixtures de teste em
   * `packages/database/src/knowledge-indexing.test.ts`) continuem válidos
   * sem precisar calcular um embedding — `chunkKnowledge()` sempre preenche
   * este campo de verdade via `embedText`, nunca o deixa `undefined`.
   */
  embedding?: number[];
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
  /** Score lexical bruto: quantidade de termos da query encontrados no chunk (contagem inteira, nunca a fórmula híbrida — ver `hybridScore`). */
  score: number;
  /**
   * Similaridade de cosseno (clampada em `[0, 1]`, ver `retrieval.ts`) entre
   * o embedding determinístico da query e o do chunk — `0` quando o chunk
   * não tem embedding (legado/nunca reindexado).
   */
  semanticScore: number;
  /** Combinação lexical + semântica usada para ORDENAR os resultados — ver a fórmula documentada em `retrieveKnowledge()`. */
  hybridScore: number;
  hasPromptInjectionRisk: boolean;
}

export interface KnowledgeRetrievalScope {
  organizationId: string;
  projectId?: string | null;
  workspaceId?: string | null;
}
