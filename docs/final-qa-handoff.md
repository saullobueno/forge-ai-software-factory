# Forge Final QA Handoff

Última atualização: 2026-09-24.

Este documento é um resumo operacional para retomada. O mapa completo e mais detalhado continua em [`PROGRESS.md`](../PROGRESS.md); em caso de divergência, confirme pelo `git log`, `git status --short` e pela suíte.

## Estado Atual

| Bloco | Status | Observação |
|---|---|---|
| Fases 0-16 | Concluídas e commitadas | Fundação, auth/RBAC, projetos/tarefas, code explorer, execuções IA, orquestração, sandbox/testing/git base, ambientes, knowledge, Playground IA, auditoria, acessibilidade e QA inicial. |
| Fase 17 | Concluída e commitada | Aprovação/rejeição humana para execuções em `approval_required`, com UI, SSE, RBAC e audit log. |
| Fase 18 | Concluída e commitada | Escritas aprovadas (`write_file`/`apply_patch`) aplicam de verdade numa cópia isolada em `.data/workspaces/<repositoryId>`. |
| Correção atual da UI | Implementada nesta sessão, ainda não commitada | `/` agora redireciona para `/projects`; sem sessão, o proxy leva para `/login`. O README explica como abrir a UI demo. |
| Preparação de produção | Implementada nesta sessão, ainda não commitada | `.env.production.example`, checklist de deploy e validação fail-fast da API para produção. |
| Correção do login local | Implementada nesta sessão, ainda não commitada | Default do PGlite agora é `<repo>/.data/forge-dev.pglite`, evitando migrate/seed em arquivo diferente do usado pela API dev. |
| Fase 11: deployments demo | Implementada nesta sessão, ainda não commitada | Platform/admin solicitam deployments; ambientes protegidos criam approval pendente e audit log. |
| Fase 12: conhecimento integrado | Implementada nesta sessão, ainda não commitada | Seed persiste fontes/chunks; API lista/busca conhecimento; UI no detalhe do projeto. |

## Como Ver A Demo Local

Sem Docker local:

```bash
pnpm db:migrate
pnpm --filter @forge/database db:seed
pnpm dev
```

Abra `http://localhost:3000`. A rota raiz redireciona para `/projects` e, sem sessão, para `/login`.

Credenciais:

- `tech-lead@acme-platform.example` / `demo1234`
- `platform@acme-platform.example` / `demo1234`
- `dev@acme-platform.example` / `demo1234`

Telas úteis depois do login:

- `/projects`
- `/projects/[id]`
- `/projects/[id]/tasks/[taskId]`
- `/projects/[id]/tasks/[taskId]/runs/[runId]`
- `/projects/[id]/code`
- `/ai-playground`
- `/audit-logs`

## Validação Recomendada

Rode em sequência, especialmente API e Playwright, para evitar contenção PGlite/Next/Nest no Windows:

```bash
pnpm install
pnpm turbo run build lint typecheck test
pnpm --filter @forge/api test:e2e
pnpm --filter @forge/web test:e2e
```

Resultados confirmados antes desta sessão, segundo `PROGRESS.md`:

| Comando | Resultado |
|---|---|
| `pnpm turbo run build lint typecheck test` | 34/34 tasks passaram |
| `pnpm --filter @forge/api test:e2e` | 89/89 testes passaram |
| `pnpm --filter @forge/web test:e2e` | 12/12 testes Playwright passaram |

Resultados confirmados nesta sessão:

| Comando | Resultado |
|---|---|
| `pnpm --filter @forge/web typecheck` | passou |
| `pnpm --filter @forge/web lint` | passou |
| `pnpm --filter @forge/web test:e2e` | 12/12 testes passaram |
| `pnpm --filter @forge/api test` | 4 arquivos / 8 testes passaram |
| `pnpm --filter @forge/api lint` | passou |
| `pnpm --filter @forge/api typecheck` | passou |
| `pnpm turbo run build lint typecheck test` | 34/34 tasks passaram |
| `pnpm --filter @forge/api test:e2e -- runtime-smoke.e2e-spec.ts` | 1 arquivo / 2 testes passaram |
| Login via `:3001/auth/login` e `:3000/api/auth/login` | passou com contas demo |
| `pnpm --filter @forge/database typecheck` | passou |
| `pnpm --filter @forge/database lint` | passou |
| `pnpm --filter @forge/database test` com PGlite temporário | 6 arquivos / 18 testes passaram |
| `pnpm --filter @forge/api test:e2e -- environments.e2e-spec.ts` | 1 arquivo / 9 testes passaram |
| `pnpm --filter @forge/web test:e2e -- environment-deployments.spec.ts` | 1 teste passou |
| `pnpm --filter @forge/knowledge typecheck` | passou |
| `pnpm --filter @forge/knowledge test` | 1 arquivo / 6 testes passaram |
| `pnpm --filter @forge/api test:e2e -- knowledge.e2e-spec.ts` | 1 arquivo / 7 testes passaram |
| `pnpm --filter @forge/web test:e2e -- project-knowledge.spec.ts` | 1 teste passou |
| `pnpm turbo run build lint typecheck test` | 31/34 passaram; `@forge/database#test` estourou hook PGlite sob carga |
| `pnpm --filter @forge/database test` | rerun isolado passou: 6 arquivos / 18 testes |

Observação: o Playwright pode imprimir `[ELIFECYCLE] Command failed with exit code 1` no teardown do web server mesmo quando a suíte termina com `12 passed` e o comando retorna código 0.

Observação desta sessão: `pnpm --filter @forge/api test:e2e` completo foi tentado após a mudança de env, mas ficou preso no encerramento sem reportar resultado; o processo foi interrompido e limpo. O `runtime-smoke.e2e-spec.ts` direcionado passou em seguida, cobrindo a inicialização real do Nest como `node dist/main.js` e `nest start`.

## Limites Deliberados

- Docker local não é requisito para continuar agora. O modo dev usa PGlite, fila em memória e IA mock determinística.
- `run_command`/`run_tests` continuam simulados depois da aprovação. Para execução real com segurança, precisa de runner isolado com rede bloqueada, idealmente no ambiente de produção/staging, não no host local.
- `@forge/testing` e `@forge/git` existem como base, mas ainda não estão conectados ao orquestrador principal nem persistindo resultados reais do pipeline.
- Deploy real, decisão approve/reject de approvals de deployment, provedores reais de IA, GitHub real, OpenTelemetry/exporters e dashboards continuam pendentes.
- Conhecimento já está persistido e buscável na demo, mas ainda falta indexador automático, embeddings/vector store e conexão direta com agentes.
- A tabela `approvals` registra a decisão já tomada; ainda não existe uma fila/painel cross-execução de aprovações pendentes baseada em linhas `pending`.

## Próximas Frentes Seguras

| Prioridade | Frente | Próximo passo recomendado |
|---|---|---|
| Alta | UI de entrada/demo | Commitar a correção de `/` -> `/projects` e documentação do README. |
| Alta | Produção sem Docker local | `.env.production.example` e `docs/production-deployment.md` preparados; ainda falta configurar serviços reais e validar deploy. |
| Média | Fase 11 | Implementar approve/reject para approvals de deployment e plugar execução real em provedor externo. |
| Média | Fase 12 | Criar indexador automático de docs/repositório, adicionar embeddings/vector store e conectar recuperação aos agentes. |
| Média | Fase 13 | Adicionar fronteira para provedores reais Gemini/Groq com feature flag e histórico persistido. |
| Média | Fases 9/10/18 | Conectar testes/Git/comandos reais apenas quando houver runner isolado adequado. |
| Baixa | Fase 15 | Lighthouse, budgets de bundle e testes responsivos. |
