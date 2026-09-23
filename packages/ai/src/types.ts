import type { AgentRole, AgentToolName } from '@forge/types';

/**
 * Um arquivo do repositório demo já lido de verdade pelo orquestrador (Fase
 * 7, spec §21 — "implementação simulada... sem exigir credenciais
 * externas") e oferecido como contexto ao provedor de IA. Nunca inventado:
 * sempre vem de uma leitura real via `RepositoryReader` contra o fixture em
 * disco.
 */
export interface AiRepositoryFileContext {
  path: string;
  content: string;
}

/**
 * Saída resumida de um step anterior da MESMA execução, na ordem em que
 * rodou — permite que um papel posterior (ex.: `implementer`) reaja ao que
 * um papel anterior (ex.: `code_explorer`) encontrou de verdade, sem
 * reimplementar a leitura.
 */
export interface AiPriorStepContext {
  role: AgentRole;
  summary: string;
  output: Record<string, unknown>;
}

/**
 * Requisição de geração para um step de agente (spec §8/§9). O shape é
 * deliberadamente próximo do que uma chamada real ao Vercel AI SDK
 * (`generateText`) receberia — um "papel"/instrução, o contexto disponível
 * e as ferramentas que o agente tem permissão de propor — para que plugar
 * um provedor real (`@ai-sdk/anthropic`) no lugar de `MockAiProvider` seja,
 * no limite, trocar a implementação desta interface, não redesenhar o
 * orquestrador.
 */
export interface AiGenerateRequest {
  role: AgentRole;
  /** `AgentRun.objective` (spec §9). */
  objective: string;
  acceptanceCriteria: string | null;
  /**
   * `Agent.allowedTools` do papel (spec §8) — o provedor NUNCA deve propor
   * uma ferramenta fora desta lista. O orquestrador também revalida isso
   * de forma independente antes de executar qualquer tool call (defesa em
   * profundidade — ver `AgentRunOrchestrator`), mas o provedor já é
   * desenhado para respeitar o escopo mínimo.
   */
  availableTools: readonly AgentToolName[];
  /** Conteúdo real do repositório demo, lido pelo orquestrador antes de chamar `generate`. */
  repositoryFiles: readonly AiRepositoryFileContext[];
  /** Steps anteriores desta execução, na ordem em que rodaram. */
  priorSteps: readonly AiPriorStepContext[];
}

export interface AiProposedToolCall {
  toolName: AgentToolName;
  arguments: Record<string, unknown>;
  /**
   * Presente SOMENTE para ferramentas de escrita/comando/Git
   * (`write_file`, `apply_patch`, `run_command`, `create_commit`,
   * `create_pull_request` — as que `decideToolPolicy` classifica como
   * `require_approval`). É o resultado determinístico e coerente que
   * representaria a execução, gerado pelo mesmo provedor que propôs a
   * chamada — nunca escrito à mão pelo orquestrador (spec §18: o
   * orquestrador desta fase decide/registra, nunca executa de verdade).
   * Ausente para ferramentas de leitura/inspeção, que o orquestrador
   * sempre executa de verdade contra o fixture.
   */
  simulatedResult?: Record<string, unknown>;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiGenerateResult {
  /** Resumo em linguagem natural do que este step decidiu (para `AiPriorStepContext.summary` do próximo step). */
  summary: string;
  toolCalls: readonly AiProposedToolCall[];
  /** Saída estruturada específica do papel — persistida em `agentSteps.output`. */
  output: Record<string, unknown>;
  usage: AiUsage;
}

/**
 * Adaptador de provedor de IA (Fase 7, spec §17 — "Vercel AI SDK/adaptadores
 * de provedores"). `MockAiProvider` é a única implementação desta fase; um
 * provedor real entraria implementando esta mesma interface por cima de
 * `generateText`/`@ai-sdk/anthropic` (ver `factory.ts`).
 */
export interface AiProvider {
  readonly name: string;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}
