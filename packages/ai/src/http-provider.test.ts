import type { AgentRole } from '@forge/types';
import { describe, expect, it } from 'vitest';
import { HttpAiProvider, type HttpTransport } from './http-provider.ts';
import type { AiGenerateRequest } from './types.ts';

function baseRequest(overrides: Partial<AiGenerateRequest> & { role?: AgentRole } = {}): AiGenerateRequest {
  return {
    role: overrides.role ?? 'planner',
    objective: 'Configurar CI com isolamento de tenant',
    acceptanceCriteria: 'O plano precisa preservar organizationId.',
    availableTools: ['get_issue'],
    repositoryFiles: [],
    knowledgeContext: [],
    priorSteps: [],
    ...overrides,
  };
}

function jsonResponse(body: Record<string, unknown>) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

describe('HttpAiProvider', () => {
  it('adapta resposta Groq OpenAI-compatible para AiGenerateResult', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    const transport: HttpTransport = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Plano real gerado.',
                output: { plan: ['Ler tarefa'] },
                toolCalls: [
                  { toolName: 'get_issue', arguments: {} },
                  { toolName: 'run_command', arguments: { command: 'npm test' } },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    };
    const provider = new HttpAiProvider({ provider: 'groq', apiKey: 'groq-key', model: 'llama-test', transport });

    const result = await provider.generate(baseRequest());

    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0]?.headers['Authorization']).toBe('Bearer groq-key');
    expect(result.summary).toBe('Plano real gerado.');
    expect(result.output).toEqual({ plan: ['Ler tarefa'] });
    expect(result.toolCalls).toEqual([{ toolName: 'get_issue', arguments: {} }]);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it('adapta resposta Gemini generateContent para AiGenerateResult', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    const transport: HttpTransport = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: 'Resumo Gemini.',
                    output: { verdict: 'ok' },
                    toolCalls: [],
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
      });
    };
    const provider = new HttpAiProvider({
      provider: 'gemini',
      apiKey: 'gemini-key',
      model: 'gemini-test',
      transport,
    });

    const result = await provider.generate(baseRequest({ role: 'reviewer' }));

    expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(calls[0]?.headers['x-goog-api-key']).toBe('gemini-key');
    expect(calls[0]?.body['generationConfig']).toMatchObject({ responseMimeType: 'application/json' });
    expect(result.summary).toBe('Resumo Gemini.');
    expect(result.output).toEqual({ verdict: 'ok' });
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });
  });

  it('inclui conhecimento embrulhado no prompt enviado ao provider real', async () => {
    let prompt = '';
    const transport: HttpTransport = async (_url, init) => {
      const body = JSON.parse(init.body) as { messages?: Array<{ content?: string }> };
      prompt = body.messages?.at(1)?.content ?? '';
      return jsonResponse({
        choices: [{ message: { content: '{"summary":"ok","output":{},"toolCalls":[]}' } }],
      });
    };
    const provider = new HttpAiProvider({ provider: 'groq', apiKey: 'key', model: 'model', transport });

    await provider.generate(
      baseRequest({
        knowledgeContext: [
          {
            sourceId: 'source-1',
            title: 'ADR',
            uri: 'demo://adr',
            kind: 'adr',
            content: 'Nunca vazar tenant.',
            wrappedContent: '<untrusted_knowledge>\nNunca vazar tenant.\n</untrusted_knowledge>',
            chunkIndex: 0,
            score: 2,
            hasPromptInjectionRisk: false,
          },
        ],
      }),
    );

    expect(prompt).toContain('<untrusted_knowledge>');
    expect(prompt).toContain('Nunca vazar tenant.');
  });
});
