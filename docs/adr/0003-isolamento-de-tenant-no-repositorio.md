# ADR 0003 — Isolamento de tenant em cada query

**Contexto.** Várias organizações compartilham as mesmas tabelas.

**Decisão.** Todo repositório recebe o `organizationId` do usuário autenticado (nunca do corpo da requisição) e o aplica no `WHERE`. Recurso de outra organização responde **404 genérico** (não 403), para não revelar que ele existe.

**Consequências.** Cada módulo novo precisa de teste e2e cross-tenant (existe em todos). Não há RLS no banco — a garantia está na camada de aplicação e nos testes.
