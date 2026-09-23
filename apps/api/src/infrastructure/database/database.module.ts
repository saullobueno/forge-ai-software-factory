import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

/**
 * `@Global()`: a conexão de banco é um recurso único por processo,
 * injetado em vários módulos de domínio (auth, projects, e futuramente
 * tasks/agent-runs/etc. das próximas fases) — evita reimportar este
 * módulo em cada um deles.
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
