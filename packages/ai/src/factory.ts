import { MockAiProvider } from './mock-provider.ts';
import type { AiProvider } from './types.ts';

/**
 * Fábrica de provedor de IA (Fase 7, spec §17/§21). Sem `ANTHROPIC_API_KEY`
 * no ambiente — o caso padrão de um checkout local deste portfólio — usa
 * `MockAiProvider` (determinístico, sem rede, spec §21 "Modo Demo").
 *
 * Um provedor real entraria aqui, atrás da MESMA interface `AiProvider`:
 *
 * ```ts
 * import { anthropic } from '@ai-sdk/anthropic';
 * import { generateText } from 'ai';
 *
 * class AnthropicAiProvider implements AiProvider {
 *   readonly name = 'anthropic';
 *   async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
 *     const result = await generateText({
 *       model: anthropic('claude-sonnet-4-5'),
 *       system: systemPromptFor(request.role),
 *       prompt: promptFor(request),
 *       tools: toolSchemasFor(request.availableTools),
 *     });
 *     return adaptToAiGenerateResult(result);
 *   }
 * }
 * ```
 *
 * Nada em `@forge/agents` (o orquestrador) precisaria mudar — ele só
 * depende de `AiProvider`, nunca de `MockAiProvider` diretamente.
 */
export function createAiProvider(env: { ANTHROPIC_API_KEY?: string | undefined } = process.env): AiProvider {
  if (env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY está definido, mas nenhum provedor de IA real foi implementado nesta fase — ' +
        'ver o comentário de `createAiProvider` em packages/ai/src/factory.ts para o ponto de extensão.',
    );
  }
  return new MockAiProvider();
}
