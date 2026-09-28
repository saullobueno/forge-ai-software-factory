import type { NextConfig } from "next";

// `apps/web` (:3000 em dev) e `apps/api` (:API_PORT, default 3001) são
// origens diferentes — o cookie httpOnly `forge_session` (sameSite=lax) não
// atravessa fetch cross-origin do browser para a API. `rewrites()` faz o
// Next.js repassar `/api/*` server-side para a API real, preservando
// `Set-Cookie`: o browser sempre chama um caminho same-origin
// (`/api/auth/login`, etc.) e nunca precisa saber a porta real da API.
// Ver `.env.example` (`API_INTERNAL_URL`).
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
