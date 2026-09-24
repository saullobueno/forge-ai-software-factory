# Forge Threat Model

Última atualização: 2026-09-24.

## Escopo

Este threat model cobre as superfícies pedidas na Fase 14: runner/sandbox, ferramentas de agentes, secrets, Git, contexto de IA/RAG, exports/downloads e canais realtime. O produto ainda roda majoritariamente em modo demo/local, então este documento separa controles já implementados de lacunas antes de provedores externos e execução real de código não confiável.

## Ativos

- Código-fonte e fixtures de repositório.
- Identidade de usuários, papéis RBAC e organização corrente.
- Tokens/cookies de sessão.
- Tool calls, propostas de patch, comandos, diffs e artefatos.
- Secrets referenciados por `SecretReference`.
- Contexto de IA: prompts, conhecimento recuperado, mensagens, usage e custos.
- Ambientes, deployments, PRs e aprovações.

## Fronteiras De Confiança

| Fronteira | Entrada | Controle Atual | Lacuna |
|---|---|---|---|
| Browser -> API | Cookie/JWT, payloads JSON | Guards JWT/RBAC, Zod, proxy same-origin | CSRF formal e rate limiting ainda pendentes |
| API -> Banco | Queries por organização | `organizationId` no `WHERE`, 404 genérico entre inexistente/outro tenant | Auditoria de todo endpoint mutável ainda parcial |
| Agente -> Tool | Tool name/args gerados por IA | `agent.allowedTools` + `authorizeToolCall` + política de comandos | Aprovação humana real para todas as ações pendentes |
| Runner -> Workspace | Comandos/processos | path guard, env allowlist, timeout, bloqueio destrutivo | Isolamento forte exige Docker/Firecracker/limites de rede em produção |
| IA -> Contexto RAG | Docs/ADRs/repo | `wrapUntrustedKnowledge`, detector de prompt injection | Indexador/persistência ainda não ligados ao orquestrador |
| API -> Git/Deploy | Branches, commits, deployments | Providers mock/fronteiras injetáveis | Credenciais reais e branch protections ainda pendentes |
| API -> Realtime | SSE de agent runs | Canal por endpoint autenticado/tenant scoped | Backpressure, replay e quotas por conexão ainda pendentes |

## Cenários E Mitigações

| Ameaça | Impacto | Mitigações Já Presentes | Próximo Passo |
|---|---|---|---|
| Prompt injection em docs muda instruções do agente | Exfiltração, tool calls indevidas | Conhecimento marcado como não confiável; tool policy server-side independente do modelo | Bloquear fontes de alto risco ou exigir revisão antes de indexar |
| Comando destrutivo proposto por IA | Perda de dados no runner | `isDestructiveCommandLine`, approval required/deny, sandbox local bloqueia antes de spawn | Runner isolado real e política allowlist por projeto |
| Path traversal em leitura de código/artefatos | Vazamento de arquivos do host | Repositório e artifact services validam escopo/path | Testes de fuzz para paths Windows/Unix |
| Cross-tenant access por id conhecido | Vazamento de projeto/tarefa/run | Queries com `organizationId`, 404 genérico, e2e multi-tenant | Cobrir todos endpoints novos com teste de tenant |
| Secrets entram em prompt por padrão | Exposição a provider externo | Entidade `SecretReference`; spec exige referência, não valor | Secret resolver com redaction e audit log obrigatório |
| Git provider real executa ação não aprovada | Commit/PR indevido | `@forge/git` ainda isolado/mock; ações de escrita são `require_approval` | Policy gate antes de branch/commit/PR real |
| SSE entrega evento para usuário errado | Vazamento de status/run | Controller consulta run com tenant antes de abrir canal | Teste e2e multi-tenant específico para SSE |
| Export/download contém dados sensíveis | Vazamento fora do produto | Artefatos têm storage key interna e endpoint autenticado | Redaction e classificação antes de exportar |
| Observabilidade registra payload sensível | Vazamento em logs/traces | Trace inicial registra metadata mínima de step/tool/status | Redaction central antes de exporter externo |

## Decisões De Segurança

- Execução real de escrita/comandos/Git continua desacoplada do orquestrador até existir aprovação humana e isolamento forte.
- O modelo nunca é autoridade de autorização. Toda tool call passa por política server-side.
- Conhecimento recuperado é dado não confiável, mesmo quando vem do próprio repositório.
- Tracing deve priorizar metadados operacionais: ids, status, duração, tokens e decisões de política; payloads completos só com redaction explícita.

## Checklist Para Novas Fases

- Endpoint novo tem JWT/RBAC, Zod e teste 401/403.
- Recurso tenant-scoped inclui `organizationId` no `WHERE`.
- Ação mutável gera audit log ou decisão explícita de adiamento.
- Tool call nova entra no enum fechado e em teste de política.
- Qualquer conteúdo vindo de IA/RAG é tratado como não confiável.
- Runner/Git/deploy real exigem aprovação humana antes de alterar estado externo.
