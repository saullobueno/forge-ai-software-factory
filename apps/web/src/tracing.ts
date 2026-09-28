import {
  ROOT_CONTEXT,
  SpanKind,
  defaultTextMapGetter,
  defaultTextMapSetter,
  trace,
  type Context,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Fase 14 continuação #3 — fecha a lacuna registrada em `PROGRESS.md`
 * ("propagação de trace context entre `apps/web` e `apps/api` — cada
 * requisição do proxy Next.js hoje inicia um trace novo, sem `traceparent`
 * herdado"). `apps/api/src/tracing.ts` já emite spans OTel reais (Fase 14
 * continuação); o gap real era que o proxy same-origin (`/api/:path*`,
 * `next.config.ts`) nunca gerava/propagava um `traceparent` W3C — cada
 * requisição chegava "fria" na API, que então iniciava um trace novo e
 * desconectado.
 *
 * **Decisão deliberada de escopo (releia antes de expandir isto)**: NÃO
 * instrumentamos o Next.js inteiro com auto-instrumentação completa
 * (`@opentelemetry/auto-instrumentations-node`, o que `apps/api` usa) —
 * isso cobriria toda requisição de página/RSC/asset também, um projeto
 * maior com risco real de instabilidade/overhead que não se justifica
 * para o gap real (só o proxy `/api/*` precisa propagar contexto). Este
 * módulo cria só um `TracerProvider` mínimo (`BasicTracerProvider` de
 * `@opentelemetry/sdk-trace-base` — o mesmo pacote que
 * `agent-run-otel-span-recorder.spec.ts` já usa em `apps/api` para testar
 * instrumentação manual, comprovadamente resolvível neste ambiente pnpm)
 * e cria manualmente UM span real por requisição proxied em
 * `src/proxy.ts` — nunca um span "fake"/log disfarçado de span.
 *
 * **Mesma filosofia de zero-credencial do resto do projeto**:
 * `ConsoleSpanExporter` por padrão (nenhuma credencial, span real
 * impresso no stdout do processo do Next.js assim que termina, igual
 * `apps/api/src/tracing.ts`); `OTLPTraceExporter` opt-in só quando
 * `OTEL_EXPORTER_OTLP_ENDPOINT` está definido.
 *
 * **Por que dá para rodar isto dentro de `proxy.ts`**: desde o Next.js
 * 16, "Proxy" (renome de `middleware`) roda por padrão no runtime
 * Node.js completo (`node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md`, seção "Runtime": "Proxy defaults to
 * using the Node.js runtime") — não há restrição de Edge runtime aqui,
 * então pacotes Node normais (como os deste módulo) funcionam sem
 * adaptação.
 *
 * **Por que NÃO usamos `propagation.extract`/`propagation.inject`
 * globais (`@opentelemetry/api`)**: essas funções delegam para o
 * propagador GLOBAL registrado via `propagation.setGlobalPropagator()` —
 * registrar isso mutaria estado global do processo Node só para uso
 * interno deste módulo. Em vez disso, instanciamos um
 * `W3CTraceContextPropagator` (`@opentelemetry/core`) local e chamamos
 * `.extract()`/`.inject()` diretamente nele — mesmo comportamento W3C
 * Trace Context (https://www.w3.org/TR/trace-context/), sem tocar em
 * nenhum singleton global.
 */

const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

function buildSpanProcessor(): BatchSpanProcessor | SimpleSpanProcessor {
  if (otlpEndpoint) {
    const url = `${otlpEndpoint.replace(/\/+$/, '')}/v1/traces`;
    const exporter: SpanExporter = new OTLPTraceExporter({ url });
    return new BatchSpanProcessor(exporter);
  }
  return new SimpleSpanProcessor(new ConsoleSpanExporter());
}

// `proxy.ts` é importado uma vez por processo do Next.js (`next dev`/
// `next start`), mas `next dev` pode recarregar módulos entre requisições
// sob certas condições (HMR do lado do servidor) — um guard em
// `globalThis` evita registrar múltiplos `SpanProcessor`s (e, portanto,
// imprimir cada span mais de uma vez) no mesmo processo. Mesmo raciocínio
// de "seguro registrar mais de uma vez, mas desnecessário" já documentado
// para serviços stateless em `apps/api`.
declare global {
  var __forgeWebTracerProvider: BasicTracerProvider | undefined;
}

const provider =
  globalThis.__forgeWebTracerProvider ??
  new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'forge-web',
      [ATTR_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.0',
    }),
    spanProcessors: [buildSpanProcessor()],
  });
globalThis.__forgeWebTracerProvider = provider;

const propagator = new W3CTraceContextPropagator();
const tracer = provider.getTracer('forge-web-proxy');

export interface IncomingProxyTraceHeaders {
  traceparent?: string | undefined;
  tracestate?: string | undefined;
}

/**
 * Chamado por `src/proxy.ts` para cada requisição que bate no rewrite
 * `/api/:path*`. Extrai um `traceparent`/`tracestate` de entrada, se
 * houver (nunca existe vindo do browser hoje — nenhuma instrumentação
 * client-side foi adicionada, fora de escopo desta continuação — mas o
 * caminho existe para herdar um trace real se um dia houver), abre e
 * fecha um span CLIENT real representando a decisão de proxy, e devolve
 * os headers W3C prontos para sobrescrever na requisição que segue para
 * o rewrite de `next.config.ts`.
 *
 * **Limitação documentada, não escondida**: este span cobre só a decisão
 * de proxy (extrair contexto + gerar header), não a chamada HTTP de
 * verdade contra `apps/api` em si — essa chamada é feita internamente
 * pelo mecanismo de `rewrites()` do próprio Next.js, fora da visibilidade
 * deste módulo (não é um `fetch()` escrito à mão aqui). O span real e
 * completo da requisição inteira (incluindo o tempo de rede) é o span
 * HTTP SERVER que `apps/api` cria ao receber a requisição — este span
 * aqui só garante que os dois compartilham o mesmo `traceId`.
 */
export function buildProxyTraceHeaders(
  method: string,
  pathname: string,
  incoming: IncomingProxyTraceHeaders,
): Record<string, string> {
  const incomingCarrier: Record<string, string> = {};
  if (incoming.traceparent) incomingCarrier['traceparent'] = incoming.traceparent;
  if (incoming.tracestate) incomingCarrier['tracestate'] = incoming.tracestate;

  const parentContext: Context = propagator.extract(ROOT_CONTEXT, incomingCarrier, defaultTextMapGetter);

  const span = tracer.startSpan(
    `web.proxy ${method} ${pathname}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.request.method': method,
        'url.path': pathname,
      },
    },
    parentContext,
  );

  const contextWithSpan = trace.setSpan(parentContext, span);
  const outgoing: Record<string, string> = {};
  propagator.inject(contextWithSpan, outgoing, defaultTextMapSetter);
  span.end();

  return outgoing;
}
