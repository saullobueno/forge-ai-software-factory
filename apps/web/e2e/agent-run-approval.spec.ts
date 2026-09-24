import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta (Fase 17 — fluxo de aprovação humana, spec
 * §9/§18): login como `tech-lead@acme-platform.example` (tem
 * `agent_run:approve`, ver `packages/domain/src/permissions.ts`) -> dispara
 * uma execução de IA real na tarefa demo -> aguarda ela parar em
 * "Aguardando aprovação" -> vê as tool calls pendentes com o
 * argumento/resultado proposto -> aprova ou rejeita -> confirma que o badge
 * de status muda via o canal SSE que a página já mantém aberto, **sem
 * `page.reload()` em nenhum momento** (mesmo padrão rigoroso de
 * `agent-run-cancel-sse.spec.ts`).
 *
 * A tarefa demo ("Estornos aparecem como cobrança positiva na fatura")
 * sempre faz o `implementer` propor um único `apply_patch` (ferramenta de
 * escrita) sobre um arquivo real do fixture — a política
 * (`decideToolPolicy`) sempre marca isso como `require_approval`, então a
 * execução SEMPRE para em "Aguardando aprovação" com exatamente uma tool
 * call pendente (mesmo raciocínio documentado em
 * `agent-run-orchestration.spec.ts`), nunca avança sozinha para
 * "Concluída"/"Falhou" por conta própria.
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

  // Sem reload em nenhum ponto — o orquestrador roda em background (fora
  // deste request) e a UI acompanha via SSE/polling real do DOM.
  await expect(page.getByTestId('run-status')).toHaveText('Aguardando aprovação', { timeout: 30_000 });
}

test.describe('fluxo de aprovação humana de execuções de IA (approval_required -> decisão -> SSE)', () => {
  test('mostra as tool calls pendentes e aprova a execução: status muda para "Concluída" sem reload', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsTechLeadAndTriggerRun(page);

    await expect(page.getByRole('heading', { name: 'Aprovação necessária' })).toBeVisible();
    const pendingToolCall = page.getByTestId('pending-tool-call');
    await expect(pendingToolCall).toHaveCount(1);
    await expect(pendingToolCall.getByText('apply_patch', { exact: true })).toBeVisible();

    const approveButton = page.getByRole('button', { name: 'Aprovar' });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    // `expect(...).toHaveText` faz polling e só passa quando o DOM mudar de
    // verdade — aqui, só quando o evento chega pelo `EventSource` aberto
    // desde que a página carregou (ver `useEffect` em
    // `agent-run-detail-view.tsx`), nunca por um `page.reload()`.
    await expect(page.getByTestId('run-status')).toHaveText('Concluída');
    await expect(approveButton).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aprovação necessária' })).not.toBeVisible();
  });

  test('mostra as tool calls pendentes e rejeita a execução: status muda para "Falhou" sem reload', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsTechLeadAndTriggerRun(page);

    await expect(page.getByTestId('pending-tool-call')).toHaveCount(1);

    const rejectButton = page.getByRole('button', { name: 'Rejeitar' });
    await expect(rejectButton).toBeVisible();
    await rejectButton.click();

    await expect(page.getByTestId('run-status')).toHaveText('Falhou');
    await expect(rejectButton).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aprovação necessária' })).not.toBeVisible();
  });

  test('esconde os botões de decisão para um usuário sem agent_run:approve (developer)', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/login');
    await page.getByLabel('Email').fill('dev@acme-platform.example');
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

    // `developer` (spec §2) tem `agent_run:trigger`/`agent_run:cancel`, mas
    // não `agent_run:approve` — o backend responderia 403 a uma chamada
    // direta; a UI simplesmente não oferece a ação (`canApproveAgentRuns`,
    // `apps/web/src/lib/agent-run-approval-permission.ts`). O painel
    // continua visível (é informação, não ação) — só os botões somem.
    await expect(page.getByRole('heading', { name: 'Aprovação necessária' })).toBeVisible();
    await expect(page.getByTestId('pending-tool-call')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Aprovar' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Rejeitar' })).not.toBeVisible();
  });
});
