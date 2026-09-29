import { Injectable } from '@nestjs/common';
import { context, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { describeSqlOperation, type DatabaseQueryObserver } from '@forge/database';

/**
 * Fecha a lacuna documentada em `PROGRESS.md` desde a Fase 14 continuação
 * #4 ("queries Drizzle individuais não ganham span/métrica/log próprios, só
 * o span HTTP que as envolve"). Implementa `DatabaseQueryObserver`
 * (`@forge/database`, `client.ts`) — a mesma decisão arquitetural já usada
 * por `AgentRunOtelSpanRecorder`: o pacote framework-agnostic só expõe uma
 * porta mínima, e é `apps/api` quem sabe sobre OpenTelemetry.
 *
 * **Decisão confirmada lendo código, não assumida**: em produção real (
 * `DATABASE_URL` definido, driver `pg`), `@opentelemetry/instrumentation-pg`
 * (dependência de `@opentelemetry/auto-instrumentations-node`, já registrada
 * em `apps/api/src/tracing.ts` via `getNodeAutoInstrumentations()`) já
 * instrumenta `pg.Client.prototype.query` automaticamente — toda query real
 * contra Postgres já ganha um span próprio hoje, sem nenhuma mudança nesta
 * continuação. Por isso `DatabaseService` só passa este recorder para
 * `createDatabase()` no caminho PGlite (ver `database.module.ts`): o PGlite
 * (`@electric-sql/pglite`, WASM próprio) nunca passa pelo módulo `pg`, então
 * a auto-instrumentação nunca o alcança — é exatamente essa lacuna de
 * dev/teste local que este recorder fecha.
 *
 * Nomenclatura/atributos seguem a mesma filosofia de segurança já
 * documentada em `AgentRunOtelSpanRecorder`: o texto SQL que o Drizzle gera
 * SEMPRE parametriza valores (`$1`, `$2`, ...) — confirmado lendo SQL real
 * gerado por `db.select()/.insert()/.update()/.delete()` — então
 * `operation`/`table` (extraídos por `describeSqlOperation`, puro, sem
 * OTel) são seguros como atributo de span. Os `params` reais (onde valores
 * literais de fato vivem) NUNCA viram atributo — nem passando por
 * `redactSensitiveValues()`, já que é um array posicional sem nomes de
 * campo (essa função só redige por NOME de chave); a defesa aqui é simples
 * e mais forte: expor só a contagem (`db.sql.params_count`), nunca os
 * valores.
 */
const SLOW_QUERY_THRESHOLD_MS = 500;

@Injectable()
export class DatabaseQueryOtelRecorder implements DatabaseQueryObserver {
  private readonly tracer = trace.getTracer('forge.database');
  private readonly otelLogger = logs.getLogger('forge.database');

  async observe<T>(sql: string, paramCount: number, run: () => Promise<T>): Promise<T> {
    const { operation, table } = describeSqlOperation(sql);
    const spanName = table ? `db.query ${operation} ${table}` : `db.query ${operation}`;
    const span = this.tracer.startSpan(
      spanName,
      {
        attributes: {
          'db.system': 'postgresql',
          'db.operation': operation,
          ...(table ? { 'db.sql.table': table } : {}),
          'db.sql.params_count': paramCount,
        },
      },
      context.active(),
    );

    const startedAt = Date.now();
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      span.recordException(error instanceof Error ? error : new Error(message));
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      throw error;
    } finally {
      const durationMs = Date.now() - startedAt;
      span.setAttribute('db.duration_ms', durationMs);
      span.end();
      if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
        this.emitSlowQueryLog(span, spanName, operation, table, durationMs);
      }
    }
  }

  /**
   * Mesmo idioma já documentado em `AgentRunOtelSpanRecorder.emitLog`:
   * `context: trace.setSpan(context.active(), span)` EXPLÍCITO — não
   * `context.active()` implícito — porque nem todo teste (nem
   * necessariamente todo caminho de processo) registra um `ContextManager`
   * real; passar o span explicitamente correlaciona o `LogRecord` ao span
   * certo em teste e produção igualmente.
   */
  private emitSlowQueryLog(
    span: Span,
    spanName: string,
    operation: string,
    table: string | undefined,
    durationMs: number,
  ): void {
    this.otelLogger.emit({
      body: `slow query: ${spanName} took ${durationMs}ms`,
      severityNumber: SeverityNumber.WARN,
      severityText: 'WARN',
      attributes: {
        'db.operation': operation,
        ...(table ? { 'db.sql.table': table } : {}),
        'db.duration_ms': durationMs,
      },
      context: trace.setSpan(context.active(), span),
    });
  }
}
