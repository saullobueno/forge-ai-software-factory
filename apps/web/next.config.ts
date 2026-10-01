import type { NextConfig } from "next";

// `apps/web` (:3000 em dev) e `apps/api` (:API_PORT, default 3001) são
// origens diferentes — o cookie httpOnly `forge_session` (sameSite=lax) não
// atravessa fetch cross-origin do browser para a API. O proxy same-origin
// (`/api/*`) que resolve isso vive em `src/app/api/[...path]/route.ts`
// (Route Handler fazendo seu próprio `fetch()` contra `API_INTERNAL_URL`),
// não mais em `rewrites()` aqui — ver o comentário completo naquele
// arquivo: o proxy de plataforma (`rewrites()`) da Vercel falha com
// `DNS_HOSTNAME_RESOLVED_PRIVATE` contra domínios atrás de Cloudflare
// (ex.: Render), mesmo com a URL certa configurada.

// `distDir` opcional (default real do Next.js: ".next") — só existe para o
// teste real de propagação de trace context (Fase 14 continuação #3,
// `apps/api/test/otel-trace-propagation.e2e-spec.ts`), que precisa subir um
// `next dev` próprio em paralelo a qualquer `pnpm dev`/Playwright que já
// esteja usando `apps/web/.next` nesta máquina — sem isolar o diretório de
// build, os dois processos disputariam o mesmo cache e um deles corromperia
// o outro (mesma classe de contenção já documentada em `PROGRESS.md` para
// PGlite). Nunca definida fora desse teste; `next dev`/`next build` normais
// continuam usando `.next` como sempre.
const distDirOverride = process.env.NEXT_WEB_DIST_DIR;

const isProduction = process.env.NODE_ENV === 'production';

// CSP: só a própria origem pode carregar scripts, estilos, imagens, fontes e conexões; a página não pode
// ser embutida (`frame-ancestors`), nem usar `<base>`/`<object>`, e formulários só enviam para si mesma.
// `'unsafe-inline'` em script/estilo é o custo de não usar nonce por requisição (o Next injeta scripts
// inline de hidratação e o tema escuro usa um script inline); `'unsafe-eval'` e `ws:` só em desenvolvimento
// (React Refresh/HMR). Tudo o que sai do navegador passa pelo proxy same-origin `/api`.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isProduction ? '' : ' ws: wss:'}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
];

const nextConfig: NextConfig = {
  ...(distDirOverride ? { distDir: distDirOverride } : {}),
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
