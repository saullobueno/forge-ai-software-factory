import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta (não mock/MSW) para a Fase 6 — "Execuções de
 * IA" (spec §9): login -> projeto demo -> tarefa demo -> abre a execução
 * `completed` já seedada (`packages/database/src/seed/run-seed.ts`) a
 * partir da lista "Execuções de IA anteriores" -> confirma que a timeline
 * real mostra os 6 `agentSteps`, os findings estruturados do `reviewer`
 * (spec §11) e as tool calls de outro step. Roda contra a API NestJS real e
 * um PGlite migrado/seedado especificamente para este teste (mesma cadeia
 * de `webServer` de `login-to-agent-run.spec.ts`).
 */
test.describe('execução de IA (completed): timeline, findings do reviewer e tool calls', () => {
  test('abre a execução seedada e confirma os 6 steps, os findings e as tool calls reais', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/login');
    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await page
      .getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' })
      .click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}$/);

    // Navega pela lista real de execuções anteriores da tarefa
    // (`GET /tasks/:id/agent-runs`) até a execução `completed` seedada —
    // não construímos a URL à mão.
    await page.getByRole('link', { name: /Corrigir o bug de formatação de moeda/ }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}\/runs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Execução de IA' })).toBeVisible();
    await expect(page.getByTestId('run-status')).toHaveText('Concluída');

    // Uma execução `completed` é terminal — não pode ser cancelada.
    await expect(page.getByRole('button', { name: 'Cancelar execução' })).not.toBeVisible();

    const steps = page.getByTestId('agent-step');
    await expect(steps).toHaveCount(6);

    // Expande o step do reviewer e confirma os findings estruturados (spec
    // §11: severidade, arquivo/linha, explicação, evidência, remediação),
    // renderizados de forma legível — não JSON cru. Filtra pelo NOME do
    // step (único), não pelo rótulo do papel: o step do
    // `documentation_agent` seedado se chama "Revisar documentação afetada
    // pela mudança" e também contém a palavra "Revisar".
    const reviewerStep = steps.filter({ hasText: 'Revisar diff e produzir findings' });
    await reviewerStep.click();
    await expect(reviewerStep.getByText('Correção do bug de sinal confirmada')).toBeVisible();
    await expect(reviewerStep.getByText('Informativa')).toBeVisible();
    await expect(reviewerStep.getByText('Falta de teste explícito para a moeda EUR')).toBeVisible();
    await expect(reviewerStep.getByText('Baixa')).toBeVisible();
    await expect(reviewerStep.getByText(/Math\.abs/).first()).toBeVisible();

    // Expande o step do code_explorer e confirma as tool calls reais.
    const explorerStep = steps.filter({ hasText: 'Inspecionar código' });
    await explorerStep.click();
    await expect(explorerStep.getByText('list_files', { exact: true })).toBeVisible();
    await expect(explorerStep.getByText('search_code', { exact: true })).toBeVisible();

    // Artefato de teste real seedado (log do vitest run).
    await expect(page.getByTestId('artifact-row')).toContainText('vitest-run.log');
    await page.getByRole('button', { name: 'Ver conteúdo' }).click();
    await expect(page.getByTestId('artifact-content')).toContainText('Tests  6 passed (6)');
  });
});
