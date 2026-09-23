import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta (não mock/MSW) para a Fase 5 — "Inteligência
 * de código" (spec §10): login -> projeto demo -> `/code` -> árvore real
 * do fixture em disco -> abre um arquivo real no Monaco (somente leitura)
 * -> busca por substring -> aba de diff com o patch real seedado. Roda
 * contra a API NestJS real e um PGlite migrado/seedado especificamente
 * para este teste (mesma cadeia de `webServer` de `login-to-agent-run.spec.ts`).
 */
test.describe('projeto -> código: árvore, arquivo, busca e diff', () => {
  test('navega até /code, abre um arquivo real, busca e vê o diff real seedado', async ({ page }) => {
    // Carrega o bundle do Monaco (JS puro, sem WASM, mas ainda um chunk
    // grande) várias vezes nesta suíte (arquivo -> busca -> outro arquivo
    // -> diff) — folga sobre o default de 30s do Playwright.
    test.setTimeout(90_000);

    await page.goto('/login');
    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    await page.getByRole('link', { name: 'Ver código' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/code$/);
    await expect(page.getByRole('heading', { name: /Código — Forge Web App/ })).toBeVisible();

    // Árvore real do fixture em disco (fixtures/acme-platform-web/) — não é
    // uma lista mockada.
    const fileButton = page.getByRole('button', { name: 'format-currency.ts' });
    await expect(fileButton).toBeVisible();
    await fileButton.click();

    // Conteúdo real aparece no Monaco (somente leitura).
    const editor = page.getByTestId('code-editor');
    await expect(editor).toBeVisible();
    await expect(editor.locator('.view-lines')).toContainText('formatCurrency', { timeout: 15_000 });

    // Símbolos top-level extraídos via TS Compiler API.
    const symbolList = page.getByTestId('symbol-list');
    await expect(symbolList).toContainText('formatCurrency');
    await expect(symbolList).toContainText('SupportedCurrency');

    // Busca simples por substring — encontra outro arquivo pelo conteúdo.
    await page.getByLabel('Buscar no repositório').fill('formatInvoiceSummary');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const searchResults = page.getByTestId('search-results');
    await expect(searchResults).toContainText('src/lib/invoice.ts');

    await searchResults.getByText('src/lib/invoice.ts').click();
    await expect(editor.locator('.view-lines')).toContainText('formatInvoiceSummary', { timeout: 15_000 });

    // Aba de diff — o patch real seedado (bug de formatCurrency perdendo o
    // sinal negativo em estornos, corrigido removendo o `Math.abs()`).
    await page.getByRole('button', { name: /^Diff/ }).click();
    const diffEditor = page.getByTestId('diff-editor');
    await expect(diffEditor).toBeVisible();
    await expect(page.getByText('src/lib/format-currency.ts')).toBeVisible();
    await expect(page.getByText('Modificado')).toBeVisible();
    await expect(diffEditor).toContainText('Math.abs', { timeout: 15_000 });
  });
});
