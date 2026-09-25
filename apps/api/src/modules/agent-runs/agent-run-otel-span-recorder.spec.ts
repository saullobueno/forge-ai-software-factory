import { trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { AgentRunTraceEvent } from '@forge/agents';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { AgentRunOtelSpanRecorder } from './agent-run-otel-span-recorder.js';

/**
 * Prova de que `AgentRunOtelSpanRecorder` emite spans OTel REAIS (não
 * simulados/mockados) — registra um `TracerProvider` de verdade com um
 * `InMemorySpanExporter` (o padrão oficial do próprio SDK do OTel para
 * testar instrumentação, `@opentelemetry/sdk-trace-base`) como tracer
 * global do processo, no lugar do `ConsoleSpanExporter` que roda em
 * produção/dev (ver `apps/api/src/tracing.ts`), e inspeciona os spans
 * exportados de verdade pelo pipeline do SDK — não uma estrutura de dados
 * fabricada por este teste.
 */
describe('AgentRunOtelSpanRecorder', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let recorder: AgentRunOtelSpanRecorder;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    trace.setGlobalTracerProvider(provider);
    recorder = new AgentRunOtelSpanRecorder();
  });

  afterEach(async () => {
    trace.disable();
    await provider.shutdown();
  });

  it('cria um span real para agent.step e um span filho real para tool.call, aninhados corretamente', async () => {
    const agentRunId = 'run-1';
    const stepId = 'step-1';
    const toolCallId = 'tool-call-1';

    const stepStart: AgentRunTraceEvent = {
      name: 'agent.step',
      phase: 'start',
      agentRunId,
      stepId,
      role: 'implementer',
      attributes: { stepName: 'Implementação' },
    };
    recorder.record(stepStart);

    // Span de step ainda não terminou — não deve aparecer no exporter.
    expect(exporter.getFinishedSpans()).toHaveLength(0);

    const toolCallStart: AgentRunTraceEvent = {
      name: 'tool.call',
      phase: 'start',
      agentRunId,
      stepId,
      toolCallId,
      role: 'implementer',
      toolName: 'write_file',
    };
    recorder.record(toolCallStart);

    const toolCallEnd: AgentRunTraceEvent = {
      name: 'tool.call',
      phase: 'end',
      agentRunId,
      stepId,
      toolCallId,
      role: 'implementer',
      toolName: 'write_file',
      status: 'succeeded',
      durationMs: 42,
      attributes: { policyDecision: 'allow' },
    };
    recorder.record(toolCallEnd);

    await provider.forceFlush();
    const afterToolCall = exporter.getFinishedSpans();
    expect(afterToolCall).toHaveLength(1);
    const toolSpan = afterToolCall[0]!;
    expect(toolSpan.name).toBe('tool.call write_file');
    expect(toolSpan.attributes['forge.tool_name']).toBe('write_file');
    expect(toolSpan.attributes['forge.tool_call_id']).toBe(toolCallId);
    expect(toolSpan.attributes['forge.status']).toBe('succeeded');
    expect(toolSpan.attributes['forge.duration_ms']).toBe(42);
    expect(toolSpan.attributes['policyDecision']).toBe('allow');

    const stepEnd: AgentRunTraceEvent = {
      name: 'agent.step',
      phase: 'end',
      agentRunId,
      stepId,
      role: 'implementer',
      status: 'succeeded',
      durationMs: 100,
      attributes: { tokens: 123, costUsd: 0.01 },
    };
    recorder.record(stepEnd);

    await provider.forceFlush();
    const afterStep = exporter.getFinishedSpans();
    expect(afterStep).toHaveLength(2);
    const stepSpan = afterStep.find((span) => span.name === 'agent.step implementer');
    expect(stepSpan).toBeDefined();
    expect(stepSpan!.attributes['forge.status']).toBe('succeeded');
    expect(stepSpan!.attributes['tokens']).toBe(123);
    expect(stepSpan!.attributes['costUsd']).toBe(0.01);

    // O span do tool.call precisa ser FILHO real do span do agent.step —
    // confirma que o `parentSpanContext.spanId` do span de tool call
    // gravado pelo pipeline real do SDK é de fato o `spanId` do span de
    // step (não uma relação simulada por este teste).
    expect(toolSpan.parentSpanContext?.spanId).toBe(stepSpan!.spanContext().spanId);
  });

  it('redige atributos sensíveis antes de virarem atributo de span (reaproveita redactSensitiveValues)', async () => {
    const agentRunId = 'run-2';
    const stepId = 'step-2';

    recorder.record({
      name: 'agent.step',
      phase: 'start',
      agentRunId,
      stepId,
      role: 'reviewer',
    });
    recorder.record({
      name: 'agent.step',
      phase: 'end',
      agentRunId,
      stepId,
      role: 'reviewer',
      status: 'failed',
      attributes: {
        error: 'falhou de verdade',
        apiKey: 'sk-super-secret-nao-pode-vazar',
        authorization: 'Bearer segredo',
      },
    });

    await provider.forceFlush();
    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();
    expect(span!.attributes['error']).toBe('falhou de verdade');
    expect(span!.attributes['apiKey']).toBe('[REDACTED]');
    expect(span!.attributes['authorization']).toBe('[REDACTED]');
  });

  it('ignora silenciosamente eventos end sem start correspondente (observabilidade nunca deve lançar)', async () => {
    expect(() =>
      recorder.record({
        name: 'tool.call',
        phase: 'end',
        agentRunId: 'run-3',
        stepId: 'step-orfao',
        toolCallId: 'tool-call-orfao',
        toolName: 'read_file',
        status: 'succeeded',
      }),
    ).not.toThrow();

    await provider.forceFlush();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});
