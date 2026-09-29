import { Injectable } from '@nestjs/common';
import { context, metrics, trace, type Counter, type Histogram, type Span } from '@opentelemetry/api';
import { logs, SeverityNumber, type Logger as OtelLogger } from '@opentelemetry/api-logs';
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
 *
 * Métricas (continuação da Fase 14 — mesma ponte, sem duplicar a lógica de
 * parsing/aninhamento de eventos acima): além do span, cada `tool.call`
 * concluído incrementa um contador (`forge.tool_call.count`, por nome da
 * ferramenta/status) e cada `agent.step` concluído registra sua duração num
 * histograma (`forge.agent_step.duration_ms`, por papel/status). Os labels
 * usados (nome da ferramenta, papel, status) vêm de campos fixos do próprio
 * `AgentRunTraceEvent` (`toolName`/`role`/`status`), nunca de
 * `event.attributes` — por isso não passam por `redactSensitiveValues()`
 * (não há nada ali que possa ser sensível, mesmo defesa em profundidade já
 * aplicada aos atributos de span de `event.attributes` via
 * `toSafeAttributes()`; se um label de métrica algum dia precisar vir de
 * `event.attributes`, ele PRECISA passar por `toSafeAttributes()` primeiro).
 *
 * Logs (continuação da Fase 14 — fecha a lacuna "sem reader de logs OTel"):
 * mesma ponte de novo, ainda sem duplicar parsing/aninhamento. Cada
 * start/end de `agent.step`/`tool.call` também emite um `LogRecord` real
 * via `logs.getLogger()` (`@opentelemetry/api-logs`) — os MESMOS eventos que
 * `AgentRunTraceLoggerService` já loga (condicionado a `FORGE_TRACE_LOGS=1`)
 * agora também alimentam o pipeline real de logs OTel, sempre ativo (não
 * depende de `FORGE_TRACE_LOGS`, mesma regra já usada para spans/métricas
 * acima). Cada `LogRecord` leva um `context` explícito
 * (`trace.setSpan(context.active(), span)`, com o span do próprio evento —
 * o de step para `agent.step`, o de tool call para `tool.call`) — o SDK de
 * logs (`Logger.emit`, `@opentelemetry/sdk-logs`) deriva `traceId`/`spanId`
 * do `LogRecord` a partir desse `context`, sem precisar montar esses campos
 * manualmente. Atributos vêm de `logAttributesFor()` (que reaproveita
 * `baseAttributes()`), já passando `event.attributes` por
 * `toSafeAttributes()`/`redactSensitiveValues()` — mesma defesa em
 * profundidade já usada para spans, nunca um caminho novo sem redação.
 */
@Injectable()
export class AgentRunOtelSpanRecorder {
  private readonly tracer = trace.getTracer('forge.agent-runs');
  private readonly meter = metrics.getMeter('forge.agent-runs');
  private readonly otelLogger: OtelLogger = logs.getLogger('forge.agent-runs');
  private readonly stepSpans = new Map<string, Span>();
  private readonly toolCallSpans = new Map<string, Span>();

  private readonly toolCallCounter: Counter = this.meter.createCounter('forge.tool_call.count', {
    description: 'Number of agent tool calls completed, labeled by tool name and status.',
  });

  private readonly agentStepDurationHistogram: Histogram = this.meter.createHistogram(
    'forge.agent_step.duration_ms',
    {
      description: 'Duration of completed agent steps, labeled by role and status.',
      unit: 'ms',
    },
  );

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
      this.emitLog(span, event, `agent.step ${event.role ?? 'unknown'} started`);
      return;
    }

    const span = this.stepSpans.get(stepId);
    this.stepSpans.delete(stepId);
    if (!span) return;
    this.applyEndAttributes(span, event);
    this.emitLog(span, event, `agent.step ${event.role ?? 'unknown'} ${event.status ?? 'ended'}`);
    span.end();

    if (typeof event.durationMs === 'number') {
      this.agentStepDurationHistogram.record(event.durationMs, {
        'forge.role': event.role ?? 'unknown',
        'forge.status': event.status ?? 'unknown',
      });
    }
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
      this.emitLog(span, event, `tool.call ${event.toolName ?? 'unknown'} started`);
      return;
    }

    const span = this.toolCallSpans.get(toolCallId);
    this.toolCallSpans.delete(toolCallId);
    if (!span) return;
    this.applyEndAttributes(span, event);
    this.emitLog(span, event, `tool.call ${event.toolName ?? 'unknown'} ${event.status ?? 'ended'}`);
    span.end();

    this.toolCallCounter.add(1, {
      'forge.tool_name': event.toolName ?? 'unknown',
      'forge.status': event.status ?? 'unknown',
    });
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
   * Emite um `LogRecord` real correlacionado ao span do próprio evento,
   * passando `context: trace.setSpan(context.active(), span)` explicitamente
   * no `LogRecord` — mesmo idioma já usado em `recordToolCall` para montar o
   * `parentContext` de um span filho (`trace.setSpan` só cria um novo
   * `Context` imutável carregando `span`, sem depender de nenhum
   * `ContextManager` registrado para "estar ativo"). `Logger.emit()`
   * (`@opentelemetry/sdk-logs`) usa esse `context` explícito para derivar
   * `traceId`/`spanId` do `LogRecord` (em vez de cair no default,
   * `context.active()`, que em produção reflete o `AsyncHooksContextManager`
   * real registrado por `NodeSDK.start()`, mas que os testes deste arquivo
   * não registram — passar `context` explicitamente funciona nos dois
   * casos). `status: 'failed'` vira `ERROR`; qualquer outro status
   * (incluindo `undefined`, no caso do evento `start`) vira `INFO` — não
   * existe hoje um terceiro nível de severidade no contrato de
   * `AgentRunTraceEvent`.
   */
  private emitLog(span: Span, event: AgentRunTraceEvent, body: string): void {
    const failed = event.status === 'failed';
    this.otelLogger.emit({
      body,
      severityNumber: failed ? SeverityNumber.ERROR : SeverityNumber.INFO,
      severityText: failed ? 'ERROR' : 'INFO',
      attributes: this.logAttributesFor(event),
      context: trace.setSpan(context.active(), span),
    });
  }

  private logAttributesFor(event: AgentRunTraceEvent): Record<string, SpanAttributeValue> {
    const attributes = this.baseAttributes(event);
    if (event.status) attributes['forge.status'] = event.status;
    if (typeof event.durationMs === 'number') attributes['forge.duration_ms'] = event.durationMs;
    return attributes;
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
