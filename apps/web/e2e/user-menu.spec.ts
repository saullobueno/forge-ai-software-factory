import { expect, test } from '@playwright/test';

test('menu de usuário mostra os dados do usuário logado e permite sair', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');

  const trigger = page.getByTestId('user-menu-trigger');
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  const menu = page.getByTestId('user-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('tech-lead@acme-platform.example');
  await expect(menu).toContainText('Tech lead');

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);

  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === 'forge_session')).toBeUndefined();

  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login/);
});
