# Observabilidade: dashboard Grafana

A API emite traces, métricas e logs via OpenTelemetry quando `OTEL_EXPORTER_OTLP_ENDPOINT` está definida
(`apps/api/src/tracing.ts`). Duas métricas de negócio saem de `AgentRunOtelSpanRecorder`:

| Métrica OTel | Tipo | Atributos |
| --- | --- | --- |
| `forge.tool_call.count` | contador | `forge.tool_name`, `forge.status` |
| `forge.agent_step.duration_ms` | histograma | `forge.role`, `forge.status` |

No Prometheus os nomes viram `forge_tool_call_count_total`, `forge_agent_step_duration_ms_{bucket,sum,count}` e os
atributos viram labels com `_` (`forge_tool_name`, `forge_role`, `forge_status`).

## Subir localmente (Collector → Prometheus → Grafana)

1. OpenTelemetry Collector com receiver OTLP/HTTP (`:4318`) e exporter `prometheus` (`:8889`).
2. Prometheus raspando `collector:8889`.
3. Grafana com o Prometheus como datasource.
4. API: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm --filter @forge/api start`.
5. Grafana → *Dashboards → Import* → `docs/observability/grafana-dashboard.json` → escolha o datasource Prometheus.

O dashboard mostra volume de tool calls por ferramenta/status, taxa de bloqueios, duração p50/p95 por papel do
pipeline e falhas de steps. Os valores exatos dependem de como o Collector renomeia métricas; ajuste as consultas se
usar `resource_to_telemetry_conversion` ou outro prefixo.
