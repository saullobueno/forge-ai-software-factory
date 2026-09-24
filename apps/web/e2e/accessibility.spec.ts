import { expect, test } from '@playwright/test';

test.describe('acessibilidade do layout autenticado', () => {
  test('expõe skip link, navegação principal e main landmark por teclado', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await expect(page.getByRole('navigation', { name: 'navegação principal' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Ir para conteúdo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Projetos' })).toBeFocused();
  });
});
