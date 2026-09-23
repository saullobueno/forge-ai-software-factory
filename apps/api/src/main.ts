import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { env } from './infrastructure/config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Necessário para o fallback de leitura do cookie `forge_session` em
  // JwtAuthGuard — sem isso, `request.cookies` fica undefined.
  app.use(cookieParser());
  // `env.API_PORT` (default 3001) é validado por zod em infrastructure/config/env.ts.
  // Antes lia `process.env.PORT` direto (sem validação, default 3000) — mesma
  // porta padrão do `apps/web` (`next dev`), o que colidiria ao rodar os dois
  // simultaneamente via `pnpm dev`.
  await app.listen(env.API_PORT);
}
await bootstrap();
