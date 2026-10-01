# ADR 0005 — Orquestrador de agentes por portas

**Contexto.** O pipeline de agentes (planejar → explorar → implementar → testar → revisar → documentar) precisa ser testável sem banco, fila ou IA real.

**Decisão.** `@forge/agents` define portas (`AgentRunStore`, `RepositoryReader`, `AgentRunEventPublisher`, sinks de trace/governança) e a API as implementa com Drizzle/NestJS. Capacidades novas entram como métodos **opcionais** da porta (ex.: `getToolPolicyOverrides?`), então os fakes antigos continuam válidos.

**Consequências.** Testes do orquestrador usam um store em memória; troca de provedor de IA (`resolveAi`) e streaming de tokens não tocam o resto.
