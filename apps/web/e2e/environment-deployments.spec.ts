import { expect, test } from '@playwright/test';

test.describe('deployments de ambientes protegidos', () => {
  test('platform engineer solicita deploy em Production e gera gate de aprovação', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('platform@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    const production = page.getByRole('listitem').filter({ hasText: 'Production' });
    await expect(production.getByText('Protegido')).toBeVisible();
    await production.getByRole('button', { name: 'Solicitar deploy' }).click();

    await expect(production.getByText('Aguardando aprovação').first()).toBeVisible();
    await expect(production.getByRole('button', { name: 'Solicitar deploy' })).toBeDisabled();

    await page.getByRole('link', { name: 'Auditoria' }).click();
    await expect(page.getByText('deployment.approval_required').first()).toBeVisible();
  });
});
