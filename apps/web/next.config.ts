import type { NextConfig } from "next";

// `apps/web` (:3000 em dev) e `apps/api` (:API_PORT, default 3001) são
// origens diferentes — o cookie httpOnly `forge_session` (sameSite=lax) não
// atravessa fetch cross-origin do browser para a API. `rewrites()` faz o
// Next.js repassar `/api/*` server-side para a API real, preservando
// `Set-Cookie`: o browser sempre chama um caminho same-origin
// (`/api/auth/login`, etc.) e nunca precisa saber a porta real da API.
// Ver `.env.example` (`API_INTERNAL_URL`).
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
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
