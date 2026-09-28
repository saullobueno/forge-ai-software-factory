import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta para o painel cross-execução de aprovações
 * pendentes (Fase 17 continuação #2, `GET /approvals/pending` + `/approvals`).
 * Não semeia nada manualmente: dispara uma execução de IA real pela tarefa
 * demo (mesmo caminho de `agent-run-approval.spec.ts`) para produzir uma
 * `approval` `pending` de verdade, então confirma que o painel cross-execução
 * a lista e que decidi-la a faz desaparecer de lá — sem `page.reload()`.
 */
async function loginAsTechLeadAndTriggerRun(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('/projects');
  await page.getByRole('link', { name: 'Forge Web App' }).click();
  await page.getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Iniciar execução de IA' }).click();
  await expect(page.getByTestId('agent-run-status')).toHaveText('Na fila');

  await page.getByRole('link', { name: /Ver detalhes da execução/ }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('run-status')).toHaveText('Aguardando aprovação', { timeout: 30_000 });

  return page.url();
}

test.describe('painel cross-execução de aprovações pendentes (/approvals)', () => {
  test('lista a execução pendente, navega até ela pelo link e some da lista após a decisão', async ({ page }) => {
    test.setTimeout(60_000);
    const runUrl = await loginAsTechLeadAndTriggerRun(page);
    // Comparado por `href` exato (id real da execução), não por texto —
    // outras specs rodando em paralelo também disparam execuções contra a
    // MESMA tarefa demo e podem deixar suas próprias aprovações pendentes
    // na lista (ex.: `agent-run-approval.spec.ts` propositalmente deixa uma
    // sem decisão, ver o comentário lá); a lista inteira nunca fica vazia
    // de forma confiável sob execução paralela, só este item específico
    // precisa aparecer e depois desaparecer.
    const runPath = new URL(runUrl).pathname;

    await page.goto('/approvals');
    await expect(page.getByRole('heading', { name: 'Aprovações pendentes' })).toBeVisible();
    const pendingLink = page.locator(`a[href="${runPath}"]`);
    await expect(pendingLink).toBeVisible();
    await expect(pendingLink.getByText('Execução de IA', { exact: true })).toBeVisible();

    await pendingLink.click();
    await expect(page).toHaveURL(runUrl);

    await page.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByTestId('run-status')).toHaveText('Concluída');

    await page.goto('/approvals');
    await expect(page.locator(`a[href="${runPath}"]`)).toHaveCount(0);
  });

  test('esconde o item de menu "Aprovações" para quem não tem agent_run:approve nem environment:approve_deployment', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('dev@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/projects');

    await expect(page.getByRole('link', { name: 'Aprovações' })).not.toBeVisible();
  });
});
