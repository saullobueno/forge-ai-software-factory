import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
}

test.describe('auditoria automatizada de acessibilidade', () => {
  test('não encontra violações axe nas rotas principais autenticadas', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Projetos' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Playground IA' }).click();
    await expect(page.getByRole('heading', { name: 'Playground IA' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Auditoria' }).click();
    await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
