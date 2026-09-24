import { expect, test } from '@playwright/test';

test.describe('conhecimento do projeto', () => {
  test('tech lead vê fontes indexadas e busca trechos de contexto', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    await expect(page.getByRole('heading', { name: 'Conhecimento' })).toBeVisible();
    await expect(page.getByText('ADR-001 Arquitetura modular do Forge').first()).toBeVisible();
    await expect(page.getByText('Regras de código do Forge Web App')).toBeVisible();
    await expect(page.getByText('score 1').first()).toBeVisible();

    await page.getByLabel('Buscar conhecimento').fill('deploy');
    await page.getByRole('button', { name: 'Buscar' }).click();

    await expect(page.getByText('README operacional do repositório demo')).toBeVisible();
    await expect(page.getByText('deployments e saúde')).toBeVisible();
  });
});
