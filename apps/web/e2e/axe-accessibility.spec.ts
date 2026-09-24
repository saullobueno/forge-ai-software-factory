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

  /**
   * Fase 15 — revisão de contraste/semântica em componentes densos
   * (PROGRESS.md listava isto como pendente): o scorecard do Playground IA
   * só existe depois de rodar uma comparação de verdade (tabela de
   * métricas + cards de output por caso, ver
   * `apps/web/src/app/(product)/ai-playground/page.tsx`) — não dá para
   * auditar sem antes disparar a comparação real via UI.
   */
  test('não encontra violações axe no scorecard do Playground IA depois de comparar modelos', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Playground IA' }).click();
    await expect(page).toHaveURL('/ai-playground');

    await page.getByRole('button', { name: 'Comparar modelos' }).click();
    await expect(page.getByRole('heading', { name: 'Scorecard' })).toBeVisible();
    await expect(page.getByText('Vencedor:')).toBeVisible();

    await expectNoAxeViolations(page);
  });

  /**
   * Fase 15 — mesma revisão de componentes densos, agora na timeline de
   * execução de IA (steps expansíveis, findings estruturados do reviewer,
   * tool calls, artefatos): usa a execução `completed` seedada
   * deterministicamente (`packages/database/src/seed/run-seed.ts`), a
   * mesma navegada por `agent-run-timeline.spec.ts` — é o estado "terminal
   * com o máximo de conteúdo renderizado" hoje disponível no seed (não há
   * uma execução `approval_required` persistida no seed; ver PROGRESS.md).
   */
  test('não encontra violações axe na timeline de execução de IA (steps, findings, tool calls, artefato)', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await login(page);
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await page
      .getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' })
      .click();
    await page.getByRole('link', { name: /Corrigir o bug de formatação de moeda/ }).click();
    await expect(page.getByRole('heading', { name: 'Execução de IA' })).toBeVisible();
    await expect(page.getByTestId('agent-step')).toHaveCount(6);

    // Expande o step do reviewer (findings estruturados: severidade,
    // arquivo/linha, evidência) e o do code_explorer (tool calls) antes de
    // auditar — conteúdo colapsado não seria avaliado pelo axe.
    const steps = page.getByTestId('agent-step');
    await steps.filter({ hasText: 'Revisar diff e produzir findings' }).click();
    await steps.filter({ hasText: 'Inspecionar código' }).click();
    await expect(page.getByTestId('artifact-row')).toBeVisible();

    await expectNoAxeViolations(page);
  });
});
