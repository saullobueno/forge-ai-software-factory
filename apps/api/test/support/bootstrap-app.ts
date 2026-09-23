import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Database, schema as SchemaModule } from '@forge/database';

export interface TestApp {
  app: INestApplication;
  db: Database;
  /**
   * Reexportado aqui (em vez de cada spec importar `@forge/database`
   * diretamente) de propósito: um import estático de `@forge/database` no
   * topo de um arquivo de teste congela `DATABASE_LOCAL_PATH` no valor
   * padrão ANTES deste helper conseguir definir o diretório temporário —
   * ver o aviso equivalente em
   * `packages/database/src/schema/integration.test.ts`.
   */
  schema: typeof SchemaModule;
  cleanup: () => Promise<void>;
}

/**
 * Sobe o `AppModule` real (guards, controllers, JWT, banco) contra um
 * PGlite isolado por teste — diretório temporário próprio, migrado do
 * zero, nunca reaproveitado entre arquivos de teste. Nada aqui é mockado:
 * se as migrações, o schema ou a lógica de isolamento de tenant
 * estiverem quebrados, os testes que usam este helper falham de verdade.
 *
 * `DATABASE_LOCAL_PATH` precisa ser definido ANTES do primeiro import de
 * `@forge/database`/`AppModule` (o env é lido uma única vez no
 * carregamento do módulo) — por isso os imports relevantes são dinâmicos
 * aqui dentro, mesma estratégia de
 * `packages/database/src/schema/integration.test.ts`.
 */
export async function bootstrapTestApp(): Promise<TestApp> {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-api-e2e-'));
  process.env['DATABASE_LOCAL_PATH'] = join(dataDir, 'forge-test.pglite');

  const { createDatabase, migratePglite, schema } = await import('@forge/database');

  // Migra numa conexão à parte e a fecha antes do app abrir a dele —
  // PGlite trava o diretório de dados para um único cliente por vez.
  const migrationConnection = createDatabase();
  await migratePglite(migrationConnection.db as Parameters<typeof migratePglite>[0], {
    migrationsFolder: '../../packages/database/drizzle',
  });
  await migrationConnection.close();

  const { AppModule } = await import('../../src/app.module.js');
  const { DatabaseService } = await import('../../src/infrastructure/database/database.service.js');

  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  await app.init();

  const db = moduleFixture.get(DatabaseService).db;

  return {
    app,
    db,
    schema,
    cleanup: async () => {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
      delete process.env['DATABASE_LOCAL_PATH'];
    },
  };
}
