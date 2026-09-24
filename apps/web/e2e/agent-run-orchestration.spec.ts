import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta (não mock/MSW) para a Fase 7 — "Orquestração de
 * agentes" (spec §8/§9): login -> tarefa demo -> dispara uma execução de IA
 * nova (`queued`) -> a fila em memória (`QueueAdapter`, Fase 0) entrega o
 * job para `AgentRunWorkerService`, que processa a execução de ponta a
 * ponta via `AgentRunOrchestrator` (`@forge/agents`) contra o repositório
 * demo real em disco -> a UI reflete o progresso via o canal SSE (Fase 6,
 * reaproveitado) **sem `page.reload()` em nenhum momento**.
 *
 * A tarefa demo ("Estornos aparecem como cobrança positiva na fatura")
 * referencia de verdade `src/lib/format-currency.ts`/`invoice.ts` no
 * fixture (`fixtures/acme-platform-web/`) — o `code_explorer` encontra
 * esses arquivos por busca real de palavras-chave do objetivo/critérios de
 * aceite, e o `implementer` propõe um `apply_patch` (ferramenta de
 * escrita). Isso SEMPRE faz a política (`decideToolPolicy`, `@forge/domain`)
 * exigir aprovação humana — a execução termina em `approval_required`, não
 * `completed`. Esse é o comportamento correto e esperado (spec §18), não
 * uma falha: prova que o orquestrador nunca aplica uma escrita de verdade
 * sem aprovação, mesmo tendo executado o pipeline inteiro.
 *
 * O orquestrador processa a execução em memória/fs (sem I/O de rede) e
 * tende a ser rápido — pode ou não terminar antes da página de detalhes
 * carregar. As asserções abaixo usam polling (`expect(...).toHaveCount`/
 * `toHaveText` com timeout, nunca `page.reload()` ou `sleep` arbitrário) e
 * são corretas nos dois casos: se a página already carregar com a
 * execução perto do fim, os testes ainda provam que a fila/orquestrador/
 * persistência funcionam de ponta a ponta; se carregar antes, a única forma
 * da UI atualizar depois é o `EventSource` desta página invalidar a query
 * (não existe polling configurado no `useQuery` de detalhe — ver
 * `agent-run-detail-view.tsx`), o que também prova o canal SSE funcionando.
 */
test.describe('orquestração de execução de IA: fila -> orquestrador -> SSE -> UI (sem reload)', () => {
  test('dispara uma execução real e observa a timeline completa até "Aguardando aprovação"', async ({ page }) => {
    test.setTimeout(60_000);

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

    // Timeline completa: os 6 papéis do pipeline (spec §8) — sem reload,
    // só polling real do DOM enquanto o orquestrador (rodando em
    // background, fora deste request) persiste cada step.
    await expect(page.getByTestId('agent-step')).toHaveCount(6, { timeout: 30_000 });

    // A execução SEMPRE para em "Aguardando aprovação" para este objetivo
    // real (o implementer propõe um apply_patch sobre um arquivo
    // encontrado de verdade no fixture) — nunca avança sozinha para
    // "Concluída" quando existe uma tool call de escrita pendente.
    await expect(page.getByTestId('run-status')).toHaveText('Aguardando aprovação', { timeout: 30_000 });

    // O botão de cancelar não deveria mais aparecer para uma execução que
    // já não está mais em progresso ativo neste teste específico — não
    // afirmamos nada sobre cancelabilidade aqui (approval_required ainda é
    // cancelável no grafo de `@forge/domain`); o foco é a timeline.
    const steps = page.getByTestId('agent-step');
    const implementerStep = steps.filter({ hasText: 'Implementar' });
    await expect(implementerStep).toBeVisible();
    await implementerStep.click();

    // Tool call de escrita real: registrada com a política real avaliada
    // (`authorizeToolCall`) e resultado simulado, nunca executada de
    // verdade contra o disco (spec §18) — por isso fica "Pendente", não
    // "Concluída".
    await expect(implementerStep.getByText('apply_patch', { exact: true })).toBeVisible();
    await expect(implementerStep.getByText('Pendente')).toBeVisible();

    const explorerStep = steps.filter({ hasText: 'Inspecionar código' });
    await explorerStep.click();
    await expect(explorerStep.getByText('read_file', { exact: true }).first()).toBeVisible();

    // O reviewer (spec §11) encontra a mesma alteração proposta pelo
    // implementer e produz um finding coerente com ela — nunca um texto
    // genérico desconectado do que realmente aconteceu nesta execução.
    const reviewerStep = steps.filter({ hasText: 'Revisar alteração e produzir findings' });
    await reviewerStep.click();
    await expect(reviewerStep.getByText('Alteração proposta revisada')).toBeVisible();

    await page.getByRole('link', { name: 'Auditoria' }).click();
    await expect(page).toHaveURL('/audit-logs');
    await expect(page.getByText('agent_run.policy_approval_required').first()).toBeVisible();
    await expect(page.getByText('apply_patch').first()).toBeVisible();
  });
});
