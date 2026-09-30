import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildProxyTraceHeaders } from './tracing';

// Next.js 16 renomeou `middleware.ts` para `proxy.ts` (mesma funcionalidade,
// ver node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
const SESSION_COOKIE_NAME = 'forge_session';
const PROTECTED_PREFIXES = [
  '/projects',
  '/tasks',
  '/agent-runs',
  '/ai-playground',
  '/ai-usage',
  '/audit-logs',
  '/approvals',
  '/notifications',
  '/settings',
];
const API_PROXY_PREFIX = '/api/';

/**
 * Checagem otimista (spec Fase 4 — só presença do cookie, nunca valida a
 * assinatura/expiração aqui): redireciona rápido para `/login` quando não
 * há cookie de sessão nas rotas de produto. A validação de verdade
 * continua sendo feita pela API a cada chamada (401/403); o client trata
 * esses casos separadamente (ver `src/lib/api-client.ts`) — este proxy
 * nunca é a única linha de defesa.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fase 14 continuação #3 — fecha a lacuna de propagação de trace
  // context entre `apps/web` e `apps/api` (ver `src/tracing.ts` para o
  // raciocínio completo). Toda requisição que o rewrite same-origin de
  // `next.config.ts` vai repassar para `apps/api` ganha um `traceparent`
  // W3C real aqui, ANTES de seguir para o rewrite — a API já honra esse
  // header automaticamente via `propagation.extract()` dentro da
  // auto-instrumentação HTTP do OTel (`apps/api/src/tracing.ts`), sem
  // nenhuma mudança necessária do lado da API. Roda antes da checagem de
  // sessão abaixo: rotas de API não usam o redirect otimista de
  // `/login` (a própria API decide 401/403).
  if (pathname.startsWith(API_PROXY_PREFIX)) {
    const traceHeaders = buildProxyTraceHeaders(request.method, pathname, {
      traceparent: request.headers.get('traceparent') ?? undefined,
      tracestate: request.headers.get('tracestate') ?? undefined,
    });
    const requestHeaders = new Headers(request.headers);
    for (const [key, value] of Object.entries(traceHeaders)) {
      requestHeaders.set(key, value);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && hasSession) {
    // `expired=1` vem de `apiFetch` num 401: o cookie existe mas a API o
    // rejeitou (JWT de 8h vencido). Devolver para /projects aqui criaria um
    // loop infinito, então o cookie inválido é descartado e o login é exibido.
    if (request.nextUrl.searchParams.get('expired') === '1') {
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
    return NextResponse.redirect(new URL('/projects', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/projects/:path*',
    '/tasks',
    '/agent-runs',
    '/ai-playground',
    '/ai-usage',
    '/audit-logs',
    '/approvals',
    '/notifications',
    '/settings',
    '/login',
  ],
};
