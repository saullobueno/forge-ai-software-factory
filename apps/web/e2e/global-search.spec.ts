import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('busca global: Ctrl+K, resultados agrupados, teclado e navegação', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Projetos', level: 1 })).toBeVisible();

  // O ponteiro fica onde o login clicou; a paleta destaca a opção sob o mouse, então o
  // teste de teclado o tira do caminho para o Enter abrir o primeiro resultado.
  await page.mouse.move(2, 2);
  await page.keyboard.press('Control+k');
  const palette = page.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox')).toBeFocused();
  await expect(palette).toContainText('Digite ao menos 2 caracteres');

  await palette.getByRole('combobox').fill('Estornos');
  const tasks = palette.getByRole('group', { name: 'Tarefas' });
  await expect(tasks.getByRole('option', { name: /Estornos aparecem como cobrança positiva na fatura/ })).toBeVisible();
  await expect(palette.getByRole('group', { name: 'Execuções de IA' })).toBeVisible();

  const results = await new AxeBuilder({ page }).include('[data-testid="command-palette"]').analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('command-palette')).toHaveCount(0);
});

test('busca global: sem resultado, Esc fecha e Ctrl+K alterna', async ({ page }) => {
  await login(page);

  await page.keyboard.press('Control+k');
  const palette = page.getByTestId('command-palette');
  await palette.getByRole('combobox').fill('zzzqwxy');
  await expect(palette).toContainText('Nenhum resultado');

  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);

  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  await page.getByTestId('command-palette').getByRole('combobox').fill('Forge Web');
  await page.getByRole('option', { name: /Forge Web App/ }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
});
