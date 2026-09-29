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

const nextConfig: NextConfig = {
  ...(distDirOverride ? { distDir: distDirOverride } : {}),
};

export default nextConfig;
