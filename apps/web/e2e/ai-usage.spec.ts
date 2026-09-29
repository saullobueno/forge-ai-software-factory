import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

test.describe('uso de IA', () => {
  test('abre o dashboard autenticado pelo menu principal', async ({ page }) => {
    await login(page);

    await page.getByRole('link', { name: 'Uso IA' }).click();

    await expect(page).toHaveURL(/\/ai-usage$/);
    await expect(page.getByRole('heading', { name: 'Uso IA' })).toBeVisible();
    // Escopado ao card de totais da ORGANIZAÇÃO (`data-testid`, Fase 13
    // continuação #7): desde que a seção "Meu uso" (abaixo) foi adicionada,
    // a página tem DUAS ocorrências de "Custo estimado"/"Tokens totais" —
    // um `getByText` sem escopo colidiria em modo estrito. Mesmo raciocínio
    // já documentado nesta spec antes da Fase 13 continuação #7 (a frase
    // descritiva "Tokens, custo estimado e provedores usados..." também já
    // colidia com o texto solto do card).
    const orgTotals = page.getByTestId('org-ai-usage-totals');
    await expect(orgTotals.getByText('Custo estimado', { exact: true })).toBeVisible();
    await expect(orgTotals.getByText('Tokens totais')).toBeVisible();
    await expect(orgTotals.getByText('Latência média')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Por provedor e modelo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Eventos recentes' })).toBeVisible();

    // "Meu uso" (Fase 13 continuação #7, `GET /ai-usage/me`): visível para
    // qualquer usuário autenticado, independente de `audit_log:read`.
    const myUsage = page.getByTestId('my-ai-usage');
    await expect(myUsage.getByRole('heading', { name: 'Meu uso (últimas 24h)' })).toBeVisible();
    await expect(myUsage.getByText('Custo estimado', { exact: true })).toBeVisible();

    // Provider de IA ativo (`GET /ai-usage/provider-config`) — seed local
    // roda sem `AI_PROVIDER`, então o provider ativo é sempre "mock".
    const providerConfig = page.getByTestId('ai-provider-config');
    await expect(providerConfig.getByRole('heading', { name: 'Provider de IA ativo' })).toBeVisible();
    await expect(providerConfig.getByText('Provider ativo:')).toBeVisible();
    await expect(providerConfig.getByText('Mock (sem rede)')).toBeVisible();

    // Série histórica diária (14 dias) — sempre 14 linhas, mesmo sem uso
    // algum registrado (dias com zero aparecem, nunca são omitidos).
    await expect(page.getByRole('heading', { name: 'Série histórica (últimos 14 dias)' })).toBeVisible();
    const timeseriesRows = page.locator('table').filter({ hasText: 'Latência média' }).first().locator('tbody tr');
    await expect(timeseriesRows).toHaveCount(14);
  });
});
