/**
 * Extração pura (sem I/O, sem dependência de OpenTelemetry) de metadados
 * seguros a partir do texto SQL que o Drizzle já gera para qualquer query
 * (`select "id" from "projects" where ...`, `insert into "projects" (...)
 * values (...)`, etc — confirmado lendo SQL real gerado por
 * `db.select()/.insert()/.update()/.delete()` via drizzle-orm 0.38.4, não
 * assumido). Usado por `apps/api` para nomear/atributar spans OTel de query
 * (ver `DatabaseQueryOtelRecorder`) sem esta lib precisar conhecer OTel.
 *
 * Deliberadamente NUNCA extrai valores literais: o Drizzle sempre
 * parametriza valores (`$1`, `$2`, ...) no texto SQL — os valores reais
 * vão em `params`, nunca no texto — então operação/nome de tabela são
 * seguros para virar atributo de span sem qualquer redação adicional.
 */
export interface SqlOperationInfo {
  operation: string;
  table?: string;
}

const OPERATION_PATTERNS: ReadonlyArray<{ operation: string; regex: RegExp }> = [
  { operation: 'select', regex: /^\s*select\b/i },
  { operation: 'insert', regex: /^\s*insert\b/i },
  { operation: 'update', regex: /^\s*update\b/i },
  { operation: 'delete', regex: /^\s*delete\b/i },
];

const IDENTIFIER = '"?([a-zA-Z_][a-zA-Z0-9_]*)"?';
const TABLE_PATTERNS: Record<string, RegExp> = {
  insert: new RegExp(`insert\\s+into\\s+${IDENTIFIER}`, 'i'),
  update: new RegExp(`update\\s+${IDENTIFIER}`, 'i'),
  select: new RegExp(`from\\s+${IDENTIFIER}`, 'i'),
  delete: new RegExp(`from\\s+${IDENTIFIER}`, 'i'),
};

export function describeSqlOperation(sql: string): SqlOperationInfo {
  const matched = OPERATION_PATTERNS.find(({ regex }) => regex.test(sql));
  const operation = matched?.operation ?? 'other';
  const table = TABLE_PATTERNS[operation]?.exec(sql)?.[1];
  return table ? { operation, table } : { operation };
}
