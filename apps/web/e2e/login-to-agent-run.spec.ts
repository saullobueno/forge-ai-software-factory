import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta (não mock/MSW): login pela UI com as
 * credenciais de demo -> `/projects` -> projeto "Forge Web App" -> tarefa
 * demo -> "Iniciar execução de IA" -> confirma um `agentRun` em
 * `status: "queued"`. Roda contra a API NestJS real e um PGlite
 * migrado/seedado especificamente para este teste (ver a cadeia de
 * `webServer` em `playwright.config.ts` + `e2e/e2e-env.ts`).
 */
test.describe('login -> projeto -> tarefa -> execução de IA', () => {
  test('faz login, abre o projeto e a tarefa demo, e dispara uma execução de IA em fila', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await expect(page.getByRole('heading', { name: 'Projetos' })).toBeVisible();

    await page.getByRole('link', { name: 'Playground IA' }).click();
    await expect(page).toHaveURL('/ai-playground');
    await expect(page.getByRole('heading', { name: 'Playground IA' })).toBeVisible();
    await page.getByRole('button', { name: 'Comparar modelos' }).click();
    await expect(page.getByRole('heading', { name: 'Scorecard' })).toBeVisible();
    await expect(page.getByText('Vencedor:')).toBeVisible();

    await page.getByRole('link', { name: 'Auditoria' }).click();
    await expect(page).toHaveURL('/audit-logs');
    await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
    await expect(page.getByText('agent_run.approved')).toBeVisible();

    await page.getByRole('link', { name: 'Projetos' }).click();
    await expect(page).toHaveURL('/projects');

    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Forge Web App' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ambientes' })).toBeVisible();
    await expect(page.getByText('Production').first()).toBeVisible();
    await expect(page.getByText('Protegido').first()).toBeVisible();

    await page
      .getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' })
      .click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { name: 'Estornos aparecem como cobrança positiva na fatura' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Iniciar execução de IA' }).click();

    await expect(page.getByTestId('agent-run-status')).toHaveText('Na fila');
    await expect(page.getByTestId('agent-run-result')).toContainText(
      'Na fila — um orquestrador vai processar esta execução automaticamente',
    );
  });
});
