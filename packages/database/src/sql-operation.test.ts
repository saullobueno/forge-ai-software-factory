import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
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
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('identifica select + tabela a partir de SQL real', async () => {
    const created = createDatabase();
    close = created.close;
    const { sql } = created.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'acme'))
      .toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'select', table: 'organizations' });
  });

  it('identifica insert + tabela a partir de SQL real', async () => {
    const created = createDatabase();
    close = created.close;
    const { sql } = created.db
      .insert(organizations)
      .values({ name: 'Acme', slug: 'acme' })
      .toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'insert', table: 'organizations' });
  });

  it('identifica update + tabela a partir de SQL real', async () => {
    const created = createDatabase();
    close = created.close;
    const { sql } = created.db
      .update(organizations)
      .set({ name: 'Acme 2' })
      .where(eq(organizations.slug, 'acme'))
      .toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'update', table: 'organizations' });
  });

  it('identifica delete + tabela a partir de SQL real', async () => {
    const created = createDatabase();
    close = created.close;
    const { sql } = created.db.delete(organizations).where(eq(organizations.slug, 'acme')).toSQL();

    expect(describeSqlOperation(sql)).toEqual({ operation: 'delete', table: 'organizations' });
  });

  it('nunca extrai valores literais dos params (permanecem parametrizados no texto, nunca no atributo)', async () => {
    const created = createDatabase();
    close = created.close;
    const { sql, params } = created.db
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
