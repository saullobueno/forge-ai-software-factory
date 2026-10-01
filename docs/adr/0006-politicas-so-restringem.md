# ADR 0006 — Políticas por organização só podem restringir

**Contexto.** Administradores querem ajustar o que os agentes podem fazer, mas um ajuste frouxo demais seria uma brecha.

**Decisão.** A decisão efetiva é `max(padrão do sistema, ajuste da organização)` na ordem `allow < require_approval < deny`. Afrouxar (ex.: `write_file` → `allow`) é rejeitado com 422 e, se um dado ruim chegar ao banco, é ignorado na leitura. A heurística de comando destrutivo continua valendo.

**Consequências.** Nenhuma configuração consegue tirar a aprovação humana de escrita. Custo: não há como "liberar" nada além do padrão — decisão consciente.
