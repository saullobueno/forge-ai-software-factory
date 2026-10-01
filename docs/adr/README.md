# Registros de decisão de arquitetura (ADRs)

Formato curto: contexto → decisão → consequências. Status: **Aceita** salvo indicação.

| # | Decisão |
| --- | --- |
| [0001](0001-monorepo-turborepo-pnpm.md) | Monorepo com pnpm + Turborepo |
| [0002](0002-pglite-local-postgres-producao.md) | PGlite local, Postgres (Neon) em produção, mesmas migrações |
| [0003](0003-isolamento-de-tenant-no-repositorio.md) | Isolamento de tenant em cada query + 404 genérico |
| [0004](0004-rbac-e-politica-de-ferramentas-no-dominio.md) | RBAC e política de ferramentas como funções puras em `@forge/domain` |
| [0005](0005-orquestrador-agnostico-de-infraestrutura.md) | Orquestrador de agentes por portas (`AgentRunStore`) |
| [0006](0006-politicas-so-restringem.md) | Políticas por organização só podem restringir |
| [0007](0007-sessoes-revogaveis-e-refresh-rotativo.md) | Sessões revogáveis, acesso curto, refresh rotativo com detecção de reuso |
| [0008](0008-ia-simulada-por-padrao.md) | IA simulada por padrão; execução real e GitHub real fora do escopo |
