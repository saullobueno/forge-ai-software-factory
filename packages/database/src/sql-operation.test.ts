import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './client.ts';
import { describeSqlOperation } from './sql-operation.ts';
import { organizations } from './schema/organizations.ts';

/**
 * Confirma `describeSqlOperation` contra SQL REAL gerado pelo query builder
 * do Drizzle (`.toSQL()`, sem executar nada contra um banco) — nunca uma
 * string SQL escrita à mão que poderia divergir do formato que o dialect
 * realmente produz (aspas em identificadores, `insert into`/`update ...
 * set`/`delete from`, parametrização via `$1`).
 */
describe('describeSqlOperation', () => {
  let db: ReturnType<typeof createDatabase>['db'];
  let close: () => Promise<void>;
  let dataDir: string;

  // Uma única instância isolada em diretório temporário: `.toSQL()` não executa
  // nada, então subir um PGlite por teste (no caminho padrão do banco de dev)
  // só gerava disputa de inicialização do WASM entre arquivos de teste em paralelo.
  beforeAll(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'forge-db-sql-operation-'));
    process.env['DATABASE_LOCAL_PATH'] = join(dataDir, 'forge-sql-operation-test.pglite');
    const created = createDatabase();
    db = created.db;
    close = created.close;
  });

  afterAll(async () => {
    await close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('identifica select + tabela a partir de SQL real', async () => {
    const { sql } = db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'acme'))
      .toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'select', table: 'organizations' });
  });

  it('identifica insert + tabela a partir de SQL real', async () => {
    const { sql } = db
      .insert(organizations)
      .values({ name: 'Acme', slug: 'acme' })
      .toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'insert', table: 'organizations' });
  });

  it('identifica update + tabela a partir de SQL real', async () => {
    const { sql } = db
      .update(organizations)
      .set({ name: 'Acme 2' })
      .where(eq(organizations.slug, 'acme'))
      .toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'update', table: 'organizations' });
  });

  it('identifica delete + tabela a partir de SQL real', async () => {
    const { sql } = db.delete(organizations).where(eq(organizations.slug, 'acme')).toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'delete', table: 'organizations' });
  });

  it('nunca extrai valores literais dos params (permanecem parametrizados no texto, nunca no atributo)', async () => {
    const { sql, params } = db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'super-secret-slug'))
      .toSQL();

    expect(sql).not.toContain('super-secret-slug');
    expect(params).toEqual(['super-secret-slug']);
    expect(describeSqlOperation(sql)).toEqual({ operation: 'select', table: 'organizations' });
  });

  it('cai em operation "other" sem tabela para SQL fora dos 4 padrões conhecidos', () => {
    expect(describeSqlOperation('begin')).toEqual({ operation: 'other' });
  });
});
