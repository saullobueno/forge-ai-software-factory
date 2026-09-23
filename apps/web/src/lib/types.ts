import type { AgentRunStatus, TaskPriority, TaskStatus } from '@forge/types';

/**
 * Modelos de view local para as respostas JSON da API (Fase 4).
 *
 * Deliberadamente NÃO reusam `Project`/`Task`/`AgentRun` de `@forge/types`
 * diretamente: aqueles schemas usam `z.coerce.date()` para `createdAt`/
 * `updatedAt` (pensados para validar dados vindos do banco, onde parse via
 * `.parse()` converteria a string ISO em `Date`). O client aqui não chama
 * `.parse()` sobre a resposta HTTP (evitaria trabalho redundante de
 * validação client-side de dados que a própria API já valida) — então os
 * campos de data continuam como `string` (ISO) tal como chegam no JSON.
 * Os enums (`TaskStatus`, `TaskPriority`, `AgentRunStatus`) são unions de
 * string simples, sem coerção, por isso esses SIM são reaproveitados de
 * `@forge/types` diretamente.
 */

export interface ApiTechProfile {
  languages: string[];
  frameworks: string[];
  packageManager: string | null;
}

export interface ApiProject {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  techProfile: ApiTechProfile;
  architectureNotes: string | null;
  codeRules: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  dependsOnTask: {
    id: string;
    title: string;
    status: TaskStatus;
  };
}

export interface ApiTask {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  priority: TaskPriority;
  labels: string[];
  assigneeId: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  dependencies: ApiTaskDependency[];
}

export interface ApiAgentRun {
  id: string;
  organizationId: string;
  taskId: string;
  agentId: string;
  workspaceId: string | null;
  status: AgentRunStatus;
  objective: string;
  scope: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  totalTokens: number;
  totalCostUsd: string;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Modelos de view da Fase 5 (`CodeModule` — spec §10 "Inteligência de
 * código"). Mesma regra de `ApiProject`/`ApiTask` acima: espelham a
 * resposta JSON tal como o backend já valida, sem reparse client-side.
 */
export interface ApiTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: ApiTreeNode[];
}

export type ApiCodeSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 're-export';

export interface ApiCodeSymbol {
  name: string;
  kind: ApiCodeSymbolKind;
  line: number;
}

export interface ApiFileContent {
  path: string;
  content: string;
  sizeBytes: number;
  language: string;
  symbols: ApiCodeSymbol[] | null;
}

export interface ApiSearchResult {
  path: string;
  matchedInName: boolean;
  matchedInContent: boolean;
  snippet: string | null;
}

export interface ApiDiffEntry {
  id: string;
  filePath: string;
  changeType: string;
  patch: string;
  additions: number;
  deletions: number;
  beforeSizeBytes: number | null;
  afterSizeBytes: number | null;
  createdAt: string;
}
