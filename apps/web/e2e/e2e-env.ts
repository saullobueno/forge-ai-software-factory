import path from 'node:path';

/**
 * Constantes usadas por `playwright.config.ts` para o e2e real de ponta a
 * ponta (login -> projeto -> tarefa -> execução de IA) contra a API/banco
 * reais — ver a cadeia de comandos dos `webServer` lá, que migra + seeda
 * este banco isolado antes de subir a API.
 *
 * Portas fora da faixa 3000-3002/5183 (README/CLAUDE.md avisam sobre uma
 * sessão paralela de outro projeto usando essas portas nesta máquina) e um
 * caminho de banco isolado do `.data/` de desenvolvimento usado por
 * `pnpm dev` — `**\/.data/` já está no `.gitignore` da raiz, então esta
 * pasta aninhada em `apps/web/.data/` também é ignorada sem precisar de
 * uma regra nova.
 */
// `__dirname` (não `import.meta.dirname`): `apps/web/package.json` não tem
// `"type": "module"`, então o Playwright transpila este arquivo para
// CommonJS ao carregar a config — `import.meta` não existe nesse contexto.
const repoRoot = path.resolve(__dirname, '../../..');

export const E2E_DATABASE_LOCAL_PATH = path.join(repoRoot, 'apps/web/.data/e2e-web/forge-e2e-web.pglite');

export const E2E_API_PORT = 3101;
export const E2E_API_URL = `http://127.0.0.1:${E2E_API_PORT}`;
export const E2E_WEB_PORT = 3100;
