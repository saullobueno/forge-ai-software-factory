import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 renomeou `middleware.ts` para `proxy.ts` (mesma funcionalidade,
// ver node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
const SESSION_COOKIE_NAME = 'forge_session';
const PROTECTED_PREFIXES = ['/projects'];

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
    return NextResponse.redirect(new URL('/projects', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/projects/:path*', '/login'],
};
