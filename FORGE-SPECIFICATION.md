---
title: Forge — Fábrica de Software com IA
type: product-specification
status: draft
version: 1.0
---

# 1. Visão do Produto

Forge é uma fábrica de software nativa em IA que transforma requisitos de produto em workflows de engenharia governados: especificação, planejamento, geração de código, revisão, testes, ambientes e entrega. É intencionalmente mais do que uma interface de chat: toda operação de IA é uma execução rastreável composta por agentes tipados, ferramentas, artefatos e aprovações.

O objetivo para portfólio é demonstrar engenharia avançada de IA, orquestração de agentes, inteligência de código, visualização de execução em tempo real, integração Git, automação isolada, segurança e developer experience.

# 2. Personas

- Desenvolvedor: delega tarefas de implementação com escopo definido e revisa diffs.
- Tech Lead: decompõe iniciativas, revisa arquitetura e aprovações.
- Product Manager: transforma requisitos em especificações executáveis.
- Engenheiro de QA: cria/executa planos de teste e revisa falhas.
- Engenheiro de Plataforma: gerencia ambientes, runners, secrets e políticas.
- Administrador: controla modelos, repositórios, permissões e auditoria.

# 3. Arquitetura de Informação

- Início
- Projetos
- Workspaces
- Tarefas
- Execuções de IA
- Alterações de Código
- Pull Requests
- Execuções de Testes
- Ambientes
- Artefatos
- Agentes
- Conhecimento
- Playground de IA
- Atividade
- Configurações
  - Organização
  - Membros
  - Funções
  - Provedores
  - Modelos
  - Repositórios
  - Runners
  - Ambientes
  - Políticas
  - Secrets
  - Notificações
  - Logs de Auditoria

# 4. UX

Estética de ferramenta para desenvolvedores inspirada em GitHub, Linear, Vercel, Raycast e IDEs modernas. Usar sidebar recolhível, breadcrumb discreto, command palette e superfícies densas de dados.

Execuções de IA precisam de uma timeline de execução de primeira classe: Planejar → Inspecionar → Implementar → Testar → Revisar → Aguardar Aprovação → Concluir.

Nunca apresentar ações destrutivas como uma “mágica” de IA em um clique. Mostrar escopo, arquivos, comandos, testes e alterações propostas antes da aprovação.

# 5. Início

KPIs: projetos ativos, tarefas de IA em execução, alterações de código abertas, testes falhando, deployments e uso/custo estimado de IA.

Widgets: projetos recentes, execuções ativas, fila de revisão, saúde dos testes, PRs recentes e insights de IA.

# 6. Projetos e Workspaces

Um projeto possui vínculos com repositórios, perfil tecnológico, documentação de arquitetura, regras de código, ambientes e histórico de tarefas.

Workspace é um contexto de execução isolado contendo branch/worktree, tarefa selecionada, execução do agente, arquivos alterados, logs e artefatos.

# 7. Sistema de Tarefas

Campos: título, descrição, critérios de aceite, prioridade, labels, responsável, projeto, status e dependências.

Status: Backlog, Pronta, Planejamento, Em Andamento, Revisão, Testes, Concluída, Bloqueada.

Uma tarefa pode iniciar uma execução de IA com escopo e política explícitos.

# 8. Sistema de Agentes de IA

Papéis dos agentes:
- Planner
- Code Explorer
- Implementer
- Test Engineer
- Reviewer
- Documentation Agent

Cada agente possui ferramentas tipadas e permissões de menor privilégio. Um orquestrador coordena os agentes por meio de uma máquina de estados, em vez de chamadas recursivas sem controle.

As ferramentas podem incluir:
`list_files`, `read_file`, `search_code`, `inspect_git`, `get_issue`, `get_project_rules`, `write_file`, `apply_patch`, `run_command`, `run_tests`, `inspect_diff`, `create_branch`, `create_commit`, `create_pull_request`.

Ações de escrita/comando/Git exigem avaliação de política. Comandos potencialmente destrutivos são bloqueados por padrão.

# 9. Modelo de Execução

Ciclo da execução:
Na Fila → Planejando → Executando → Testando → Revisão → Aprovação Necessária → Concluída/Falhou/Cancelada.

Cada etapa registra entrada, saída, tool calls, duração, tokens/custo quando aplicável, arquivos afetados e decisões de política.

Transmitir logs e status via WebSockets/SSE.

# 10. Inteligência de Código

Funcionalidades:
- Árvore do repositório
- Busca de código
- Visualizador/editor de arquivos
- Metadados de símbolos/referências quando disponíveis
- Resumos de arquivos alterados
- Resumo de cobertura de testes
- Contexto de arquitetura

Monaco pode fornecer edição/visualização; a inteligência do repositório deve ser independente do provedor.

# 11. Revisão

O revisor de IA produz findings com severidade, arquivo/linha, explicação, evidência e remediação sugerida.

Severidades: Crítica, Alta, Média, Baixa, Informativa.

O reviewer deve distinguir problemas confirmados de hipóteses.

# 12. Testes

Execuções de testes mostram suites, etapas, logs, duração, sucesso/falha, indicação de flaky e artefatos. A IA pode analisar falhas, mas nunca marcar uma execução falha como aprovada.

# 13. Ambientes

Desenvolvimento, Preview, Staging, Produção. O detalhe do ambiente mostra deployment, commit, saúde, metadados de variáveis (nunca valores secretos), logs e eventos recentes.

Deploy para ambientes protegidos exige aprovação.

# 14. Conhecimento

O Forge ingere documentação do repositório, ADRs, regras de código, `AGENTS.md`, `CLAUDE.md`, READMEs e histórico selecionado de issues/PRs. O conhecimento é versionado e possui escopo por projeto/workspace.

Conhecimento recuperado é conteúdo não confiável e não pode sobrescrever políticas de sistema/segurança.

# 15. Playground de IA

Permite comparar modelos usando um prompt e dataset controlados. Mostrar modelo, latência, uso de tokens, custo estimado, validade do output estruturado e score de avaliação.

# 16. Modelo de Dados

Organization, User, Team, Role, Project, Repository, Workspace, Task, TaskDependency, Agent, AgentRun, AgentStep, ToolCall, Policy, PolicyDecision, FileSnapshot, CodeChange, Diff, PullRequest, TestRun, TestSuite, TestArtifact, Environment, Deployment, KnowledgeSource, KnowledgeChunk, AIMessage, AIUsage, Approval, SecretReference, Notification, AuditLog.

# 17. Arquitetura

Monorepo:
`apps/web`, `apps/api`, `apps/runner`, `apps/docs`, `packages/ui`, `packages/domain`, `packages/database`, `packages/ai`, `packages/agents`, `packages/code-intelligence`, `packages/sandbox`, `packages/git`, `packages/testing`, `packages/policies`, `packages/types`.

Frontend: Next.js/React/TypeScript/Tailwind/shadcn, TanStack Query/Table, Zustand somente quando justificado, Monaco, React Hook Form/Zod.

Backend: NestJS, PostgreSQL/Drizzle, Redis/BullMQ, WebSockets/SSE.

IA: Vercel AI SDK/adaptadores de provedores. A orquestração dos agentes é uma máquina de estados explícita da aplicação.

Execução: abstração de runner isolado. Para o portfólio, usar runner local baseado em Docker em desenvolvimento e uma interface para execução remota.

# 18. Segurança do Sandbox

Nunca executar comandos gerados pelo modelo diretamente no host. Comandos são executados dentro de um runner isolado com limites de workspace, timeout, CPU/memória, política de rede e política de comandos permitidos/bloqueados.

Secrets são referenciados, nunca injetados no contexto do modelo por padrão. Branches/ambientes protegidos exigem aprovação.

# 19. Integração Git

O adaptador de repositório suporta metadados de clone, branches, commits, diffs, PRs e checks de status. O provedor GitHub deve ficar isolado atrás de uma interface, com provedor Mock para o modo demo.

# 20. Segurança e Governança da IA

Registrar modelo/provedor, versão do prompt, ferramentas, argumentos das ferramentas (com redaction quando necessário), outputs, contexto de fontes, decisões de política, aprovações, custo e duração.

Dimensões de avaliação dos agentes: sucesso da tarefa, correção dos testes, precisão da revisão, eficiência das ferramentas, alucinação, tentativas de comandos inseguros e taxa de regressão.

# 21. Modo Demo

Popular “Acme Platform” com um snapshot realista de monorepo TypeScript, issues, tarefas, PRs e execuções determinísticas de agentes. Incluir uma implementação simulada que cria um diff, executa testes e produz findings de revisão sem exigir credenciais externas.

# 22. Testes

Unitários: máquinas de estados, motor de políticas, schemas de ferramentas, parsing de diffs e permissões.
Integração: orquestração de agentes, runner, adaptador Git, aprovações, execução de testes e auditoria.
E2E: criar tarefa → planejar → inspecionar repositório → gerar alteração → executar testes → revisar diff → aprovar PR.

# 23. Roadmap

Fundação → domínio/banco → auth/RBAC → repositório demo → projetos/tarefas → inteligência de código → execuções/orquestração de IA → runner sandbox → execução de testes → revisão/diffs → integração Git → ambientes → conhecimento → playground/avaliação de IA → observabilidade/segurança → performance/acessibilidade → QA final.
