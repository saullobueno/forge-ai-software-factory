/**
 * Token de injeção para o `AiProvider` (`@forge/ai`) usado pelo
 * orquestrador. `AgentRunsModule` fornece a instância via
 * `createAiProvider()` (sem `ANTHROPIC_API_KEY` no ambiente, resolve para
 * `MockAiProvider` — ver `packages/ai/src/factory.ts`).
 */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
