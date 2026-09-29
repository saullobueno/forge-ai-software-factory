import { NextRequest } from 'next/server';

// Substitui o antigo `rewrites()` de `next.config.ts` (Fase 4). Na Vercel, o
// destino de um `rewrites()` passa por uma checagem de DNS/IP privado feita
// pela própria camada de proxy da plataforma — e falha com
// `DNS_HOSTNAME_RESOLVED_PRIVATE` contra o domínio público do Render (fica
// atrás de Cloudflare), mesmo com `API_INTERNAL_URL` correto. Um Route
// Handler fazendo seu próprio `fetch()` é código de aplicação normal, não
// passa por aquela checagem de plataforma — funciona local e em produção com
// o mesmo mecanismo. `proxy.ts` (middleware) continua rodando antes disto
// (mesmo matcher `/api/:path*`) e injeta `traceparent`/protege rotas — este
// handler só encaminha a requisição já preparada por ele.
export const dynamic = 'force-dynamic';

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

// Headers que o runtime recalcula sozinho a partir do novo corpo/conexão —
// repassar os originais do upstream causaria inconsistência (ex.: o corpo
// que devolvemos já vem descomprimido pelo `fetch`, então `content-encoding`
// do upstream não se aplica mais).
const REQUEST_HEADERS_TO_STRIP = ['host', 'content-length', 'connection'];
const RESPONSE_HEADERS_TO_STRIP = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

async function forwardToApi(request: NextRequest, path: string[]): Promise<Response> {
  const targetUrl = `${apiInternalUrl}/${path.join('/')}${request.nextUrl.search}`;

  const requestHeaders = new Headers(request.headers);
  for (const name of REQUEST_HEADERS_TO_STRIP) requestHeaders.delete(name);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body: hasBody ? await request.arrayBuffer() : undefined,
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const name of RESPONSE_HEADERS_TO_STRIP) responseHeaders.delete(name);
  // `Headers` comum colapsa múltiplos `Set-Cookie` numa string só separada
  // por vírgula — inválido para cookies reais. `getSetCookie()` preserva
  // cada um separadamente; hoje só há um por resposta (login), mas isto
  // continua correto se um dia houver mais de um.
  responseHeaders.delete('set-cookie');
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  // `upstream.body` já é o stream real do `fetch` — repassado direto, sem
  // buffer. É o mesmo caminho tanto para respostas JSON normais quanto para
  // o SSE de `/agent-runs/:id/events` (NestJS `@Sse`, `text/event-stream`):
  // nenhum tratamento especial é necessário, o streaming é transparente.
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export async function GET(request: NextRequest, { params }: RouteContext<'/api/[...path]'>) {
  const { path } = await params;
  return forwardToApi(request, path);
}

export async function POST(request: NextRequest, { params }: RouteContext<'/api/[...path]'>) {
  const { path } = await params;
  return forwardToApi(request, path);
}
