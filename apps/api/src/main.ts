// PRECISA ser o primeiro import deste arquivo — auto-instrumentação OTel
// (`./tracing.ts`) só funciona se corrigir (patch) `http`/`express` antes
// de o NestJS criar o servidor real. Ver o comentário completo em
// `tracing.ts`.
import './tracing.js';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { env } from './infrastructure/config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Necessário para o fallback de leitura do cookie `forge_session` em
  // JwtAuthGuard — sem isso, `request.cookies` fica undefined.
  app.use(cookieParser());
  // Atrás do proxy do Next/Render: `request.ip` passa a ser o cliente real (X-Forwarded-For), usado por
  // limites de taxa e pelo registro de sessões.
  // Quantos proxies confiar (default 1); em Render atrás da Vercel o IP pode exigir 2 ou mais (`TRUST_PROXY_HOPS`).
  app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env['TRUST_PROXY_HOPS'] ?? 1));
  // `env.API_PORT` (default 3001) é validado por zod em infrastructure/config/env.ts.
  // Antes lia `process.env.PORT` direto (sem validação, default 3000) — mesma
  // porta padrão do `apps/web` (`next dev`), o que colidiria ao rodar os dois
  // simultaneamente via `pnpm dev`.
  await app.listen(env.API_PORT);
}
await bootstrap();
