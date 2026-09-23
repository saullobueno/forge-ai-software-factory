import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Necessário para o fallback de leitura do cookie `forge_session` em
  // JwtAuthGuard — sem isso, `request.cookies` fica undefined.
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
