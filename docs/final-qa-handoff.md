# Forge Final QA Handoff

Última atualização: 2026-09-24.

Este documento consolida o ponto de retomada após as Fases 8-16 avançadas localmente. Ele não substitui `PROGRESS.md`; use este arquivo como checklist de revisão antes de commitar ou entregar uma demo.

## Validação Recomendada

Rode nesta ordem:

```bash
pnpm install
pnpm turbo run build lint typecheck test
pnpm --filter @forge/api test:e2e
pnpm --filter @forge/web test:e2e
```

Resultados observados nesta continuação:

| Comando | Resultado |
|---|---|
| `pnpm turbo run build lint typecheck test` | 34/34 tasks passaram |
| `pnpm --filter @forge/api test:e2e` | 10 arquivos / 77 testes passaram |
| `pnpm --filter @forge/api test:e2e -- auth.e2e-spec.ts` | 1 arquivo / 8 testes passaram após adicionar escrita de auditoria para login |
| `pnpm --filter @forge/api test:e2e -- tasks.e2e-spec.ts agent-runs.e2e-spec.ts` | 2 arquivos / 27 testes passaram após adicionar escrita de auditoria para trigger/cancel |
| `pnpm --filter @forge/api test:e2e -- ai-playground.e2e-spec.ts` | 1 arquivo / 5 testes passaram após adicionar escrita de auditoria para avaliações |
| `pnpm --filter @forge/web test:e2e -- agent-run-orchestration.spec.ts` | 1 teste passou confirmando `agent_run.policy_approval_required` na tela de Auditoria |
| `pnpm --filter @forge/web test:e2e` | 9 testes Playwright passaram |
| `pnpm --filter @forge/database test` | 6 arquivos / 18 testes passaram isolado após um timeout transitório no Turbo |

## Áreas Implementadas Nesta Continuação

| Fase | Entrega | Status |
|---|---|---|
| 8 | `@forge/sandbox` | Núcleo isolado pronto, não conectado ao orquestrador |
| 9 | `@forge/testing` | Núcleo isolado pronto, integração pendente |
| 10 | `@forge/git` | Contrato/mock/fronteira GitHub prontos, integração real pendente |
| 11 | Ambientes | API/UI/seed de leitura prontos, deploy real pendente |
| 12 | `@forge/knowledge` | Chunking/retrieval/defesa RAG prontos, indexador/persistência pendentes |
| 13 | Playground IA | API/UI demo determinísticas prontas, provider real/histórico pendentes |
| 14 | Segurança/observabilidade | Threat model, trace sink local com redaction inicial e audit logs de auth/agent run/playground/política prontos, OpenTelemetry/exporters pendentes |
| 15 | Performance/acessibilidade | Skip link/foco/teste teclado e auditoria axe prontos, Lighthouse/budgets pendentes |
| 16 | QA/documentação | Este handoff e `PROGRESS.md` atualizados |

## Pontos De Atenção Antes De Commitar

- A árvore contém várias fases não commitadas juntas. Para revisão limpa, prefira commits por tema/fase.
- `@forge/git` usa `node:test`, não Vitest, por uma inconsistência de resolução observada durante a implementação.
- `pnpm --filter @forge/web test:e2e` pode imprimir `[WebServer] [ELIFECYCLE] Command failed with exit code 1` no teardown mesmo quando o Playwright retorna `9 passed`; confirme o exit code do comando.
- `@forge/database` pode estourar timeout em execução paralela pesada; rerodar `pnpm --filter @forge/database test` isolado passou.
- `apps/api` e2e completo passou nos novos specs de auditoria; em uma execução houve timeout transitório no `runtime-smoke` de `nest start`, e o mesmo smoke passou isolado logo em seguida.
- Evite rodar `pnpm --filter @forge/api test:e2e` em paralelo com `pnpm --filter @forge/web test:e2e`: ambos podem acionar `nest build/start` e mexer em `apps/api/dist`, causando falso negativo no `runtime-smoke`. Rode essas duas suítes em sequência.
- `AgentRunTraceLoggerService` só imprime traces quando `FORGE_TRACE_LOGS=1`, para evitar ruído nos e2e.

## Limites De Produto Ainda Deliberados

- Nada executa comandos de IA não confiáveis diretamente no host.
- Sandbox, testes, Git real, deploy real e knowledge/RAG ainda não estão conectados ao orquestrador principal.
- Provedores externos de IA/Git/deploy continuam mockados ou atrás de fronteiras injetáveis.
- Aprovação humana real para escrita/comandos/deploys protegidos ainda precisa ser desenhada na UI/API.
- Falta auditoria completa para todos endpoints mutáveis, redaction ampla para todos os logs/exporters e exporter OpenTelemetry.
- A leitura de auditoria já existe em `/audit-logs`; escrita inicial cobre `auth.login_succeeded`, `auth.login_failed`, `agent_run.triggered`, `agent_run.cancelled`, `ai_playground.evaluated`, `agent_run.policy_approval_required` e `agent_run.policy_denied`, e deve ser expandida para novos endpoints mutáveis conforme surgirem.

## Ordem Sugerida De Próximos Commits

1. Fases 8-10: pacotes `sandbox`, `testing`, `git` e política destrutiva compartilhada.
2. Fase 11: ambientes API/UI/seed/e2e.
3. Fase 12: pacote `knowledge`.
4. Fase 13: AI Playground API/UI/RBAC/e2e.
5. Fase 14: threat model e tracing.
6. Fase 15-16: acessibilidade, lint ignore e documentação final.
