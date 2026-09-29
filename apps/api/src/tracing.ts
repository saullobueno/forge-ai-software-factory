import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleMetricExporter, PeriodicExportingMetricReader, type MetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Bootstrap de OpenTelemetry real (Fase 14, continuação — fecha a lacuna
 * "sem OpenTelemetry real" registrada em `PROGRESS.md` desde que a Fase 14
 * foi criada). PRECISA ser o PRIMEIRO import de `main.ts`, antes até do
 * import de `@nestjs/core` — é assim que auto-instrumentação funciona: os
 * módulos (`http`, `express`, por baixo do adapter do NestJS) precisam ser
 * corrigidos (patched) por `getNodeAutoInstrumentations()` antes de o
 * servidor HTTP real ser criado. Em módulos ES (este pacote é
 * `"type": "module"`), a especificação garante que imports estáticos são
 * avaliados na ordem em que aparecem no arquivo (para módulos irmãos sem
 * relação de dependência entre si) — por isso "primeira linha de
 * `main.ts`" é suficiente aqui, sem precisar de `--import`/`-r` no `node`.
 *
 * Mesma filosofia de PGlite/fila em memória/IA mock do resto do projeto:
 * funciona local sem nenhuma credencial (`ConsoleSpanExporter`, span por
 * span, sem buffer) e só exporta para um backend real de observabilidade
 * (Jaeger, Tempo, Honeycomb, etc.) quando `OTEL_EXPORTER_OTLP_ENDPOINT`
 * está definido — opt-in via env var, nunca exigido para rodar localmente.
 *
 * Métricas (continuação da Fase 14 — fecha a lacuna "sem exporter de
 * métricas OTel" registrada em `PROGRESS.md`) seguem exatamente a mesma
 * regra e reaproveitam a MESMA `OTEL_EXPORTER_OTLP_ENDPOINT` de traces, não
 * uma env var separada: o padrão OTLP/HTTP usa o mesmo host/porta de
 * coletor para os dois sinais, só variando o path (`/v1/traces` vs
 * `/v1/metrics`) — é assim que um Collector/Jaeger/Tempo real espera
 * receber ambos, então uma segunda env var só adicionaria uma forma de
 * configuração divergir da outra sem ganho real. Sem essa env var, métricas
 * (incluindo as de HTTP emitidas automaticamente por
 * `getNodeAutoInstrumentations()` quando um `MeterProvider` está
 * registrado — comportamento padrão dessas instrumentations, não precisa de
 * configuração extra) vão para `ConsoleMetricExporter`, com um intervalo de
 * exportação curto para ficarem visíveis rapidamente em uso local/manual.
 */

const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

function buildSpanProcessor(): BatchSpanProcessor | SimpleSpanProcessor {
  if (otlpEndpoint) {
    const url = `${otlpEndpoint.replace(/\/+$/, '')}/v1/traces`;
    const exporter: SpanExporter = new OTLPTraceExporter({ url });
    // Exporter de rede real: usa buffer (`BatchSpanProcessor`) para não
    // fazer uma chamada HTTP por span.
    return new BatchSpanProcessor(exporter);
  }
  // Default local: imprime cada span no console assim que ele termina, sem
  // buffer — mesma filosofia de "funciona sem nada configurado" do resto
  // do projeto, e facilita a verificação manual/automatizada de que spans
  // reais estão sendo emitidos.
  return new SimpleSpanProcessor(new ConsoleSpanExporter());
}

const LOCAL_METRIC_EXPORT_INTERVAL_MS = 10_000;

function buildMetricReader(): MetricReader {
  if (otlpEndpoint) {
    const url = `${otlpEndpoint.replace(/\/+$/, '')}/v1/metrics`;
    return new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url }) });
  }
  // `PeriodicExportingMetricReader` é o único tipo de leitor "push" que o
  // SDK de métricas oferece (não existe um equivalente a
  // `SimpleSpanProcessor` para métricas) — mesmo sem backend real, ele
  // ainda precisa de um intervalo; 10s (bem menor que o default de 60s)
  // deixa o `ConsoleMetricExporter` visível rápido o suficiente para
  // verificação manual local, sem gerar ruído excessivo.
  return new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
    exportIntervalMillis: LOCAL_METRIC_EXPORT_INTERVAL_MS,
  });
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'forge-api',
    [ATTR_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.0',
  }),
  spanProcessors: [buildSpanProcessor()],
  metricReaders: [buildMetricReader()],
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

let shuttingDown = false;

async function shutdownTracing(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await sdk.shutdown();
  } catch {
    // Encerramento de observabilidade nunca deve travar/derrubar o processo
    // (mesma regra já aplicada a `AgentRunTraceLoggerService`/`recordTrace`
    // no orquestrador: telemetria é auxiliar, nunca crítica).
  }
}

// `runtime-smoke.e2e-spec.ts` mata o processo filho com SIGKILL/taskkill
// (sem esperar handler nenhum) — este handler cobre o caso de encerramento
// "gentil" fora dos testes (Ctrl+C local, `docker stop`, orquestrador de
// produção mandando SIGTERM), não é o que garante que o smoke test não
// trave.
process.on('SIGTERM', () => {
  void shutdownTracing();
});
process.on('SIGINT', () => {
  void shutdownTracing();
});
