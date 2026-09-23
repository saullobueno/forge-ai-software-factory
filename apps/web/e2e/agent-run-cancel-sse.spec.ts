import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta (não mock/MSW) para o cancelamento e o canal
 * SSE da Fase 6 (spec §9 — "transmitir logs e status via WebSockets/SSE"):
 * login -> tarefa demo -> dispara uma execução de IA nova (`queued`) ->
 * abre a página da execução -> cancela -> confirma que o badge de status
 * muda para "Cancelada" SEM `page.reload()` — a mudança chega pelo canal
 * SSE real (`GET /agent-runs/:id/events`), não por um refetch manual.
 *
 * Roda contra a API NestJS real e um PGlite migrado/seedado
 * especificamente para este teste (mesma cadeia de `webServer` de
 * `login-to-agent-run.spec.ts`).
 */
async function loginAndOpenDemoTask(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('/projects');
  await page.getByRole('link', { name: 'Forge Web App' }).click();
  await page.getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}$/);
}

test.describe('cancelamento de execução de IA via canal SSE (sem reload de página)', () => {
  test('clica em "Cancelar execução" e o badge muda para "Cancelada" sem recarregar a página', async ({ page }) => {
    await loginAndOpenDemoTask(page);

    await page.getByRole('button', { name: 'Iniciar execução de IA' }).click();
    await expect(page.getByTestId('agent-run-status')).toHaveText('Na fila');

    await page.getByRole('link', { name: /Ver detalhes da execução/ }).click();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('run-status')).toHaveText('Na fila');

    const cancelButton = page.getByRole('button', { name: 'Cancelar execução' });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // Sem `page.reload()` em nenhum ponto acima ou abaixo — `expect(...).toHaveText`
    // faz polling e só passa quando o DOM realmente mudar, o que aqui só
    // acontece quando o evento chega pelo `EventSource` aberto pela página
    // (ver `useEffect` em `agent-run-detail-view.tsx`).
    await expect(page.getByTestId('run-status')).toHaveText('Cancelada');
    await expect(cancelButton).not.toBeVisible();
  });

  test('recebe via SSE um cancelamento disparado por OUTRA aba, sem clicar em nada localmente', async ({
    page,
    context,
  }) => {
    await loginAndOpenDemoTask(page);

    await page.getByRole('button', { name: 'Iniciar execução de IA' }).click();
    await expect(page.getByTestId('agent-run-status')).toHaveText('Na fila');

    await page.getByRole('link', { name: /Ver detalhes da execução/ }).click();
    await expect(page).toHaveURL(/\/runs\/([0-9a-f-]{36})$/);
    await expect(page.getByTestId('run-status')).toHaveText('Na fila');

    const match = page.url().match(/\/runs\/([0-9a-f-]{36})$/);
    const runId = match?.[1];
    if (!runId) throw new Error('Não foi possível extrair o id da execução da URL.');

    // Simula outra aba/cliente: usa o `APIRequestContext` do MESMO contexto
    // de browser (mesmo cookie de sessão httpOnly), mas sem nunca clicar em
    // "Cancelar execução" nesta página — a única forma da página em `page`
    // saber que o status mudou é o evento chegando pelo SSE que ela já
    // mantém aberto desde que carregou.
    const cancelResponse = await context.request.post(`/api/agent-runs/${runId}/cancel`);
    expect(cancelResponse.ok()).toBe(true);

    await expect(page.getByTestId('run-status')).toHaveText('Cancelada');
    await expect(page.getByRole('button', { name: 'Cancelar execução' })).not.toBeVisible();
  });
});
