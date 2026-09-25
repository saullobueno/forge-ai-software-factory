# Forge Final QA Handoff

Última atualização: 2026-09-25.

Este é o resumo curto de retomada. O mapa completo continua em [`PROGRESS.md`](../PROGRESS.md); se houver divergência, confie no `PROGRESS.md`, no `git log`, no `git status --short` e na suíte.

## Estado Atual

| Bloco | Status | Observação |
|---|---|---|
| Fases 0-8 | Concluídas e commitadas | Fundação, domínio/banco, auth/RBAC, repositório demo, projetos/tarefas, code explorer, execuções IA, orquestração e runner/sandbox base. |
| Fase 9 | Continuada e verificada | `run_tests` real agora persiste `test_runs`, `test_suites` e artefato de log quando há repositório/fixture disponível. |
| Fase 10 | Continuada e verificada | Escritas aprovadas geram branch/commit/PR via `MockGitProvider` e persistem snapshots, diffs, code changes e pull request. GitHub real segue fora de escopo. |
| Fase 11 | Continuada e verificada | Deployments demo podem ser solicitados; ambientes protegidos têm gate approve/reject por `admin`. Deploy real externo ainda pendente. |
| Fase 12 | Continuada e verificada | Conhecimento persistido/buscável e conectado ao orquestrador como `knowledgeContext`; falta indexador automático/embeddings. |
| Fase 13 | Continuada e verificada | Providers `gemini`/`groq`, uso/custo/latência em `/ai-usage` e limites diários por organização via env; faltam limites por usuário e séries históricas. |
| Fase 14 | Continuada e verificada | OpenTelemetry real conectado para HTTP + spans de agent steps/tool calls; faltam métricas, trace propagation web->api e mais audit logs. |
| Fase 15 | Continuada e verificada | Drawer mobile, axe ampliado, responsividade e Lighthouse com budgets locais; falta budget de bundle/chunk em CI. |
| Fases 16-18 | Concluídas e commitadas | QA/handoff, aprovação humana de agent runs e escrita real isolada pós-aprovação. |

Últimos commits relevantes:

| Commit | Resumo |
|---|---|
| `904dbc1` | Atualiza `PROGRESS.md` após Fases 9/10/14 verificadas |
| `b7d23aa` | Conecta `MockGitProvider` à persistência real de PR |
| `36846e8` | Persiste resultados reais de `run_tests` |
| `41546db` | Liga tracing OpenTelemetry real na API |
| `7dae611` | Expõe usage IA no detalhe do agent run |

## Como Ver A Demo Local

Sem Docker local:

```bash
pnpm db:migrate
pnpm --filter @forge/database db:seed
pnpm dev
```

Abra `http://localhost:3000`. A raiz redireciona para `/projects`; sem sessão, o proxy leva para `/login`.

Credenciais:

- `tech-lead@acme-platform.example` / `demo1234`
- `platform@acme-platform.example` / `demo1234`
- `dev@acme-platform.example` / `demo1234`
- `admin@acme-platform.example` / `demo1234`

Telas úteis:

- `/projects`
- `/projects/[id]`
- `/projects/[id]/tasks/[taskId]`
- `/projects/[id]/tasks/[taskId]/runs/[runId]`
- `/projects/[id]/code`
- `/ai-playground`
- `/ai-usage`
- `/audit-logs`

## Validação Recomendada

Rode em sequência para evitar contenção PGlite/Next/Nest no Windows:

```bash
pnpm install
pnpm turbo run build lint typecheck test
pnpm --filter @forge/api test:e2e
pnpm --filter @forge/web test:e2e
```

Validação final registrada no `PROGRESS.md` para o HEAD atual:

| Comando | Resultado |
|---|---|
| `pnpm turbo run build lint typecheck test --force` | 34/34 tasks passaram |
| `pnpm --filter @forge/api test:e2e` | 114/114 testes passaram |
| `pnpm --filter @forge/web test:e2e` | 21/21 passaram após reruns isolados de flakes por contenção |

Notas de ambiente:

- Não rode suítes e2e PGlite pesadas em paralelo; isso já causou timeouts de `beforeAll` sob carga.
- Playwright pode imprimir ruído de teardown mesmo quando a suíte passa e o processo retorna código 0.
- Se mexer em pacotes consumidos pela API em runtime (`types`, `domain`, `database`, `ai`, `agents`), valide também `apps/api/test/runtime-smoke.e2e-spec.ts`.

## Limites Deliberados

- Docker local não é requisito para continuar agora. Dev usa PGlite, fila em memória, provider IA mock por padrão e `MockGitProvider`.
- `write_file`/`apply_patch` aprovados escrevem de verdade apenas em cópia isolada de `.data/workspaces/<repositoryId>`, nunca em `fixtures/`.
- `run_tests` já executa de verdade no pipeline inicial quando há repositório e persiste o resultado, mas `run_tests` depois de aprovação e `run_command` real ainda dependem de runner isolado seguro.
- Git mock está conectado; GitHub real requer credenciais/decisão de permissões.
- Deploy demo e gates existem; deploy real em Render/Vercel/afins ainda precisa configuração/implementação.
- Gemini/Groq estão disponíveis por env, há dashboard inicial de custo/token/latência e limites diários por organização; tráfego real amplo ainda pede limites por usuário e séries históricas.
- OpenTelemetry exporta traces; métricas, dashboards e propagação de trace web->api continuam pendentes.

## Próximas Frentes Seguras

| Prioridade | Frente | Próximo passo recomendado |
|---|---|---|
| Alta | Produção sem Docker local | Configurar Neon/Upstash/Render/Vercel em staging e validar migrations/seed/deploy. |
| Alta | Fase 13 operacional | Adicionar limites por usuário e séries históricas de custo/latência. |
| Média | Fase 12 | Indexador lexical automático para docs/repositório; depois embeddings/vector store. |
| Média | Fase 14 | Métricas OTel, trace propagation web->api e audit logs nos endpoints mutáveis restantes. |
| Média | Fase 11 | Deploy real externo com logs/saúde por ambiente. |
| Baixa | Fase 15 | Budgets de bundle/chunk no CI. |
