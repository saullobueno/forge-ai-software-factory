# ADR 0004 — RBAC e política de ferramentas como funções puras

**Contexto.** Agentes de IA propõem ações; é preciso decidir de forma auditável o que roda sozinho, o que exige aprovação humana e o que é negado.

**Decisão.** `hasPermission`, `decideToolPolicy` e `authorizeToolCall` vivem em `@forge/domain` como funções puras, sem I/O. Falha fechada: ferramenta desconhecida é negada; comando destrutivo é sempre negado; escrita/comando/Git exigem aprovação.

**Consequências.** Fácil de testar exaustivamente (testes unitários) e de reutilizar no orquestrador e na API. A tela de Configurações lê a mesma matriz.
