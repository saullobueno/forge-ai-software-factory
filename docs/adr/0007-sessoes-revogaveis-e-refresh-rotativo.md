# ADR 0007 — Sessões revogáveis e refresh rotativo

**Contexto.** Um JWT de 8 horas não pode ser revogado e continua válido mesmo depois de trocar o papel ou remover o usuário.

**Decisão.** Acesso = JWT de 15 min com `sid`; a cada requisição a sessão (`user_sessions`) precisa estar ativa e papel/organização vêm do banco. Refresh token opaco (hash SHA-256 no banco), **rotativo**, em cookie `httpOnly` restrito a `/api/auth`; reapresentar o token anterior fora de 15 s revoga a sessão (detecção de roubo). 2FA TOTP com segredo cifrado (AES-256-GCM) e códigos de recuperação de uso único. Limite de tentativas de login por e-mail (5 falhas / 15 min).

**Consequências.** Uma leitura de banco por requisição (chave primária). Contas de demonstração são isentas de bloqueio e de 2FA, pois compartilham a senha pública. O limitador é em memória: vale por instância (suficiente para um único processo; com réplicas, usar Redis).
