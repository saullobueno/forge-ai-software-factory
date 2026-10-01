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
    // O cabeçalho tem controles (logo, busca, notificações, menu do usuário) antes da navegação:
    // o link "Projetos" da navegação principal precisa ser alcançável por Tab, sem armadilha de foco.
    const projectsLink = page.getByRole('navigation', { name: 'navegação principal' }).getByRole('link', { name: 'Projetos' });
    let reached = false;
    for (let attempt = 0; attempt < 12 && !reached; attempt += 1) {
      await page.keyboard.press('Tab');
      reached = await projectsLink.evaluate((element) => element === document.activeElement);
    }
    expect(reached).toBe(true);
  });
});
