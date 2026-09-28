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
    // `exact: true` (mesmo idioma já usado em outras specs, ex.
    // `agent-run-orchestration.spec.ts`): sem isso, o locator também casa a
    // frase descritiva "Tokens, custo estimado e provedores usados..." logo
    // acima do card — bug pré-existente na própria spec, não relacionado a
    // conhecimento/indexação, encontrado ao rodar a suíte completa.
    await expect(page.getByText('Custo estimado', { exact: true })).toBeVisible();
    await expect(page.getByText('Tokens totais')).toBeVisible();
    await expect(page.getByText('Latência média')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Por provedor e modelo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Eventos recentes' })).toBeVisible();
  });
});
