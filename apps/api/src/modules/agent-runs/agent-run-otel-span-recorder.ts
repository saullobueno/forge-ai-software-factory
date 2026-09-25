import { Injectable } from '@nestjs/common';
import { context, trace, type Span } from '@opentelemetry/api';
import type { AgentRunTraceEvent } from '@forge/agents';
import { redactSensitiveValues } from '../../infrastructure/logging/redaction.js';

type SpanAttributeValue = string | number | boolean;

/**
 * Ponte entre o "trace sink" de aplicação que já existia desde a Fase 14
 * (`AgentRunTraceEvent`/`AgentRunTraceSink`, `packages/agents/src/ports.ts`)
 * e spans OTel reais e exportáveis (Fase 14, continuação). `@forge/agents`
 * continua desacoplado de OpenTelemetry de propósito — só conhece a porta
 * mínima em `ports.ts` — esta classe vive inteiramente em `apps/api`, o
 * mesmo ponto onde `AgentRunTraceLoggerService` já hospedava o log
 * estruturado condicionado a `FORGE_TRACE_LOGS=1`.
 *
 * Nomenclatura/aninhamento de spans:
 * - cada evento `agent.step` (start/end) abre/fecha um span raiz — a porta
 *   não expõe um evento de início/fim da execução (`agentRun`) inteira,
 *   então não existe hoje um span agregador único por execução (ver
 *   `PROGRESS.md`, lacuna documentada deliberadamente, não esquecida —
 *   abrir isso exigiria mudar o contrato de `AgentRunTraceEvent`, fora do
 *   escopo mínimo desta continuação);
 * - cada evento `tool.call` (start/end) abre/fecha um span filho do span do
 *   `agent.step` em que ocorreu, localizado pelo `Map` de spans de step
 *   ainda abertos.
 *
 * Os `Map`s guardam spans "em voo" entre os eventos `start`/`end` do mesmo
 * `stepId`/`toolCallId` — o orquestrador (`AgentRunOrchestrator`) sempre
 * emite os dois lados de cada evento, inclusive nos caminhos de erro (ver
 * `orchestrator.ts`), então nenhuma entrada deveria ficar presa
 * indefinidamente sob operação normal; um evento `end` sem `start`
 * correspondente (ou vice-versa) é ignorado silenciosamente — observabilidade
 * nunca deve lançar nem afetar o resultado da execução real.
 */
@Injectable()
export class AgentRunOtelSpanRecorder {
  private readonly tracer = trace.getTracer('forge.agent-runs');
  private readonly stepSpans = new Map<string, Span>();
  private readonly toolCallSpans = new Map<string, Span>();

  record(event: AgentRunTraceEvent): void {
    if (event.name === 'agent.step') {
      this.recordStep(event);
      return;
    }
    this.recordToolCall(event);
  }

  private recordStep(event: AgentRunTraceEvent): void {
    const stepId = event.stepId;
    if (!stepId) return;

    if (event.phase === 'start') {
      const span = this.tracer.startSpan(`agent.step ${event.role ?? 'unknown'}`, {
        attributes: this.baseAttributes(event),
      });
      this.stepSpans.set(stepId, span);
      return;
    }

    const span = this.stepSpans.get(stepId);
    this.stepSpans.delete(stepId);
    if (!span) return;
    this.applyEndAttributes(span, event);
    span.end();
  }

  private recordToolCall(event: AgentRunTraceEvent): void {
    const toolCallId = event.toolCallId;
    if (!toolCallId) return;

    if (event.phase === 'start') {
      const parentStep = event.stepId ? this.stepSpans.get(event.stepId) : undefined;
      const parentContext = parentStep ? trace.setSpan(context.active(), parentStep) : context.active();
      const span = this.tracer.startSpan(
        `tool.call ${event.toolName ?? 'unknown'}`,
        { attributes: this.baseAttributes(event) },
        parentContext,
      );
      this.toolCallSpans.set(toolCallId, span);
      return;
    }

    const span = this.toolCallSpans.get(toolCallId);
    this.toolCallSpans.delete(toolCallId);
    if (!span) return;
    this.applyEndAttributes(span, event);
    span.end();
  }

  private baseAttributes(event: AgentRunTraceEvent): Record<string, SpanAttributeValue> {
    const attributes: Record<string, SpanAttributeValue> = {
      'forge.agent_run_id': event.agentRunId,
    };
    if (event.stepId) attributes['forge.step_id'] = event.stepId;
    if (event.toolCallId) attributes['forge.tool_call_id'] = event.toolCallId;
    if (event.role) attributes['forge.role'] = event.role;
    if (event.toolName) attributes['forge.tool_name'] = event.toolName;
    return { ...attributes, ...this.toSafeAttributes(event.attributes) };
  }

  private applyEndAttributes(span: Span, event: AgentRunTraceEvent): void {
    if (event.status) span.setAttribute('forge.status', event.status);
    if (typeof event.durationMs === 'number') span.setAttribute('forge.duration_ms', event.durationMs);
    for (const [key, value] of Object.entries(this.toSafeAttributes(event.attributes))) {
      span.setAttribute(key, value);
    }
  }

  /**
   * Reaproveita `redactSensitiveValues()` (a mesma função que já protege
   * `AgentRunTraceLoggerService`/logs estruturados) antes de qualquer
   * `event.attributes` virar atributo de span — mesmo o contrato atual de
   * `AgentRunTraceEvent` só carregando metadados leves hoje (não
   * `arguments`/`result` brutos de tool call), esta é a defesa em
   * profundidade contra um evento futuro que passe a incluir algo
   * sensível. A API de spans do OTel só aceita valores primitivos
   * (string/number/boolean) ou arrays deles — valores não primitivos são
   * serializados via `JSON.stringify` depois da redação, nunca antes.
   */
  private toSafeAttributes(value: unknown): Record<string, SpanAttributeValue> {
    const redacted = redactSensitiveValues(value);
    if (!redacted || typeof redacted !== 'object') return {};
    const result: Record<string, SpanAttributeValue> = {};
    for (const [key, item] of Object.entries(redacted as Record<string, unknown>)) {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        result[key] = item;
      } else if (item !== undefined && item !== null) {
        result[key] = JSON.stringify(item);
      }
    }
    return result;
  }
}
