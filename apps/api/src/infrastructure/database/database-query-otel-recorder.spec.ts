import { trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseQueryOtelRecorder } from './database-query-otel-recorder.js';

/**
 * Mesmo padrão real já usado por `agent-run-otel-span-recorder.spec.ts`:
 * `TracerProvider`/`LoggerProvider` reais do SDK (`@opentelemetry/
 * sdk-trace-base`/`sdk-logs`) com exporters em memória, inspecionando o que
 * de fato foi exportado pelo pipeline do SDK — nunca uma estrutura simulada
 * por este teste.
 */
describe('DatabaseQueryOtelRecorder', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let logExporter: InMemoryLogRecordExporter;
  let loggerProvider: LoggerProvider;
  let recorder: DatabaseQueryOtelRecorder;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    trace.setGlobalTracerProvider(provider);

    logExporter = new InMemoryLogRecordExporter();
    loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
    });
    logs.setGlobalLoggerProvider(loggerProvider);

    recorder = new DatabaseQueryOtelRecorder();
  });

  afterEach(async () => {
    trace.disable();
    logs.disable();
    await provider.shutdown();
    await loggerProvider.shutdown();
  });

  it('cria um span real db.query <operacao> <tabela> a partir de SQL real gerado pelo Drizzle, sem incluir params brutos', async () => {
    const sql = 'select "id", "name" from "projects" where "projects"."organization_id" = $1';

    const result = await recorder.observe(sql, 1, async () => 'ok');
    expect(result).toBe('ok');

    await provider.forceFlush();
    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();
    expect(span!.name).toBe('db.query select projects');
    expect(span!.attributes['db.system']).toBe('postgresql');
    expect(span!.attributes['db.operation']).toBe('select');
    expect(span!.attributes['db.sql.table']).toBe('projects');
    expect(span!.attributes['db.sql.params_count']).toBe(1);
    expect(typeof span!.attributes['db.duration_ms']).toBe('number');
    // Nunca deve haver um atributo carregando o valor literal do param.
    expect(Object.values(span!.attributes)).not.toContain('org-secret-id');
  });

  it('marca o span com status ERROR real quando a query lançar, mas propaga a falha original', async () => {
    const sql = 'delete from "projects" where "projects"."id" = $1';
    const failure = new Error('conexão perdida de verdade');

    await expect(
      recorder.observe(sql, 1, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    await provider.forceFlush();
    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();
    expect(span!.name).toBe('db.query delete projects');
    expect(span!.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(span!.status.message).toBe('conexão perdida de verdade');
  });

  it('emite um LogRecord real WARN correlacionado ao span quando a query excede o limiar de slow query', async () => {
    const sql = 'update "projects" set "name" = $1 where "projects"."id" = $2';

    await recorder.observe(sql, 2, async () => {
      await new Promise((resolve) => setTimeout(resolve, 520));
      return 'done';
    });

    await provider.forceFlush();
    await loggerProvider.forceFlush();

    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();

    const logRecords = logExporter.getFinishedLogRecords();
    expect(logRecords).toHaveLength(1);
    const [logRecord] = logRecords;
    expect(logRecord!.severityNumber).toBe(SeverityNumber.WARN);
    expect(logRecord!.body).toContain('slow query');
    expect(logRecord!.attributes['db.operation']).toBe('update');
    expect(logRecord!.attributes['db.sql.table']).toBe('projects');
    expect(logRecord!.spanContext?.spanId).toBe(span!.spanContext().spanId);
    expect(logRecord!.spanContext?.traceId).toBe(span!.spanContext().traceId);
  }, 10_000);

  it('não emite LogRecord de slow query para uma query rápida', async () => {
    const sql = 'select 1';

    await recorder.observe(sql, 0, async () => 'fast');

    await loggerProvider.forceFlush();
    expect(logExporter.getFinishedLogRecords()).toHaveLength(0);
  });
});
