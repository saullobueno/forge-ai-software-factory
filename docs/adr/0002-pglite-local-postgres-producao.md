# ADR 0002 — PGlite local, Postgres em produção, mesmas migrações

**Contexto.** Qualquer pessoa deve rodar o projeto sem Docker nem contas externas; produção precisa de Postgres real.

**Decisão.** Drizzle ORM com PGlite (Postgres em WASM) localmente e `pg` (Neon) em produção, com **as mesmas migrações geradas** (`db:generate`, nunca SQL à mão). Em produção, o comando de start aplica `db:migrate:deploy` antes de subir a API.

**Consequências.** Testes e2e rodam contra Postgres de verdade, sem mocks. Custo: PGlite é lento sob carga (timeouts generosos nos testes) e só aceita um cliente por diretório de dados.
