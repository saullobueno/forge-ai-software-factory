import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTwoFilesPatch, diffLines } from 'diff';

/**
 * `fixtures/acme-platform-web` vive na raiz do monorepo, fora do workspace
 * pnpm (spec §21 — é conteúdo de demonstração, não um pacote publicável).
 * `packages/database/src/seed/fixtures.ts` está 4 níveis abaixo da raiz
 * (`seed` -> `src` -> `database` -> `packages`), daí o `../../../../`.
 */
const currentDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(currentDir, '..', '..', '..', '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'fixtures', 'acme-platform-web');

/**
 * Caminho relativo (dentro do repositório demo) do arquivo que carrega o
 * bug da história de demonstração: `formatCurrency` descartava o sinal de
 * valores negativos (estornos/créditos) via `Math.abs()`.
 */
export const DEMO_BUGGY_FILE_PATH = 'src/lib/format-currency.ts';

export interface DemoFileDiff {
  path: string;
  beforeContent: string;
  afterContent: string;
  beforeHash: string;
  afterHash: string;
  beforeSizeBytes: number;
  afterSizeBytes: number;
  patch: string;
  additions: number;
  deletions: number;
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Carrega o conteúdo real "antes" (`.snapshots/format-currency.before.ts`,
 * com o bug) e "depois" (`src/lib/format-currency.ts`, estado final do
 * repositório demo já corrigido) e gera um patch unificado real via
 * `diff` (pacote npm puro JS) — nunca escrito à mão. `additions`/
 * `deletions` vêm de `diffLines`, a mesma biblioteca, não de uma contagem
 * estimada.
 */
export function loadDemoCurrencyBugDiff(): DemoFileDiff {
  const beforeContent = readFileSync(
    join(FIXTURE_ROOT, '.snapshots', 'format-currency.before.ts'),
    'utf8',
  );
  const afterContent = readFileSync(join(FIXTURE_ROOT, DEMO_BUGGY_FILE_PATH), 'utf8');

  const patch = createTwoFilesPatch(
    `a/${DEMO_BUGGY_FILE_PATH}`,
    `b/${DEMO_BUGGY_FILE_PATH}`,
    beforeContent,
    afterContent,
    '',
    '',
  );

  const changes = diffLines(beforeContent, afterContent);
  const additions = changes
    .filter((change) => change.added === true)
    .reduce((sum, change) => sum + (change.count ?? 0), 0);
  const deletions = changes
    .filter((change) => change.removed === true)
    .reduce((sum, change) => sum + (change.count ?? 0), 0);

  return {
    path: DEMO_BUGGY_FILE_PATH,
    beforeContent,
    afterContent,
    beforeHash: sha256Hex(beforeContent),
    afterHash: sha256Hex(afterContent),
    beforeSizeBytes: Buffer.byteLength(beforeContent, 'utf8'),
    afterSizeBytes: Buffer.byteLength(afterContent, 'utf8'),
    patch,
    additions,
    deletions,
  };
}
