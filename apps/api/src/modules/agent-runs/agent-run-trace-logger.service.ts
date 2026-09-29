import { Injectable, Logger } from '@nestjs/common';
import type { AgentRunTraceEvent, AgentRunTraceSink } from '@forge/agents';
import { redactSensitiveValues } from '../../infrastructure/logging/redaction.js';
import { AgentRunOtelSpanRecorder } from './agent-run-otel-span-recorder.js';

/**
 * Implementa `AgentRunTraceSink` (`@forge/agents`) — recebido pelo
 * `AgentRunOrchestrator` como `deps.traces`. Dois efeitos por evento,
 * sempre nessa ordem:
 * 1. `AgentRunOtelSpanRecorder.record()` — spans/métricas/`LogRecord`s OTel
 *    reais, sempre ativos (não dependem de `FORGE_TRACE_LOGS`; ver
 *    `tracing.ts` para os exporters usados, incluindo o de logs).
 * 2. Log estruturado em `stdout`, só quando `FORGE_TRACE_LOGS=1` (Fase 14
 *    original) — continua existindo por ser mais fácil de grep localmente
 *    do que abrir um backend de observabilidade; os dois mecanismos são
 *    complementares, não um substituindo o outro.
 */
@Injectable()
export class AgentRunTraceLoggerService implements AgentRunTraceSink {
  private readonly logger = new Logger(AgentRunTraceLoggerService.name);

  constructor(private readonly otelSpans: AgentRunOtelSpanRecorder) {}

  record(event: AgentRunTraceEvent): void {
    this.otelSpans.record(event);
    if (process.env['FORGE_TRACE_LOGS'] !== '1') return;
    this.logger.debug(JSON.stringify(redactSensitiveValues(event)));
  }
}
