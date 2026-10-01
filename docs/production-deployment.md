# Forge Production Deployment Checklist

Última atualização: 2026-09-25.

Este checklist prepara deploy sem Docker local. Ele documenta o que já pode ser configurado agora e o que ainda precisa de implementação antes de ativar tráfego real.

## Serviços Recomendados

| Necessidade | Serviço sugerido | Variável |
|---|---|---|
| Postgres | Neon | `DATABASE_URL` |
| Redis/BullMQ | Upstash Redis com URL `rediss://` | `REDIS_URL` |
| API NestJS | Render Web Service | `NODE_ENV`, `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` |
| Web Next.js | Vercel | `API_INTERNAL_URL` |
| IA real | Gemini ou Groq | `AI_PROVIDER`, `GEMINI_API_KEY`/`GEMINI_MODEL` ou `GROQ_API_KEY`/`GROQ_MODEL` |

## API

Configure no serviço da API:

```bash
NODE_ENV=production
API_PORT=10000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
REDIS_URL=rediss://default:PASSWORD@HOST:6379
JWT_SECRET=<segredo-longo-aleatorio>
```

**`API_PORT=10000`, não `3001`**: o Render só varre um conjunto fixo de portas conhecidas para autodetectar onde o serviço escuta (10000, 3000, 8000, 8080, 4567); `3001` não está nessa lista e produz `No open ports detected` mesmo com o processo saudável. 10000 é a porta que o próprio Render usa como convenção/default para web services.

Em produção, a API agora falha cedo se `DATABASE_URL`, `REDIS_URL` ou um `JWT_SECRET` real não estiverem definidos.

Comandos no Render (Settings do serviço da API):

- **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @forge/api build`
- **Start Command**: `pnpm --filter @forge/database db:migrate:deploy && pnpm --filter @forge/api start:prod`

O Start Command aplica as migrações pendentes **antes** de subir a API, a cada deploy/restart. `db:migrate:deploy` roda só com Node (`node src/migrate.ts`, sem `tsx`, que é dependência de desenvolvimento e pode não existir no runtime do Render) e é idempotente: sem migração nova, não faz nada. Se a migração falhar, a API não sobe (falha cedo, em vez de rodar com o schema errado) — veja os logs do Render. O seed **não** entra no Start Command: rode `db:seed` uma única vez, manualmente, na criação do banco.

Para uma primeira demo, o seed pode ser aceitável. Para ambiente público, substitua por bootstrap administrativo controlado antes de abrir acesso.

**Migrações rodam sozinhas no deploy** (Start Command acima). Se algum dia o Start Command voltar a ser só `start:prod`, todo commit que gerar migração nova em `packages/database/drizzle/` exigirá rodar `db:migrate` manualmente contra o Neon — sem isso as rotas que usam as colunas novas respondem 500 e a UI fica tentando de novo (react-query faz 1 + 3 retries por rota). Rodar manualmente, no PowerShell, com a `DATABASE_URL` do Neon (a mesma do Render):

```powershell
$env:DATABASE_URL = "<url do Neon>"
pnpm --filter @forge/database db:migrate
Remove-Item Env:DATABASE_URL
```

Depois, para popular as fontes de conhecimento já com hash/embedding, use o botão "Reindexar" na tela do projeto (logado como tech lead ou admin). O seed não precisa ser rodado de novo.

## Web

Configure no deploy do app web:

```bash
API_INTERNAL_URL=https://<sua-api-render>.onrender.com
```

O proxy same-origem (`/api/*`) é um Route Handler (`apps/web/src/app/api/[...path]/route.ts`) que faz seu próprio `fetch()` contra essa URL — a variável é lida em runtime (na primeira requisição depois de o processo subir), não em build time. **Não use `rewrites()` do `next.config.ts` para isso**: a Vercel bloqueia o destino de um `rewrites()` com o erro `DNS_HOSTNAME_RESOLVED_PRIVATE` quando o host de destino fica atrás de Cloudflare (caso do domínio público do Render), mesmo com a URL certa — foi por isso que este projeto migrou de `rewrites()` para um Route Handler.

Comando de build sugerido:

```bash
pnpm install --frozen-lockfile
pnpm --filter @forge/web build
```

## IA Real

O orquestrador usa `MockAiProvider` determinístico por padrão. Para habilitar chamadas reais na API, configure explicitamente um provider:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=<sua-chave>
GEMINI_MODEL=gemini-2.0-flash
```

ou:

```bash
AI_PROVIDER=groq
GROQ_API_KEY=<sua-chave>
GROQ_MODEL=llama-3.3-70b-versatile
```

`AI_MODEL` também pode ser usado como fallback genérico para o modelo. `AI_REQUEST_TIMEOUT_MS` controla timeout por chamada (default: 30000). `AI_PROVIDER=mock` continua recomendado para demo local, testes e staging sem custo. Anthropic segue reservado como ponto futuro; `AI_PROVIDER=anthropic` falha cedo até existir adapter dedicado.

As chamadas de agente já persistem uso básico em `ai_messages`/`ai_usages` (provider, modelo, tokens, custo estimado e resposta resumida). `GET /ai-usage/summary` e `/ai-usage` já dão uma leitura operacional inicial de tokens/custo/latência média por organização. Limites diários por organização e por usuário estão descritos em "Demo pública: limites de IA e proteção" abaixo.

## Runner Real

`write_file` e `apply_patch` já aplicam mudanças reais depois de aprovação humana, mas somente em cópia isolada do repositório. O step `test_engineer` já executa `run_tests` de verdade contra o repositório demo quando há fixture/repositório disponível, persistindo `test_runs`, `test_suites` e artefato de log.

`run_command` arbitrário e execuções de comandos/testes pós-aprovação ainda devem esperar um runner isolado fora do host principal.

Para executar comandos reais em produção, implemente um runner isolado fora do host principal:

- rede bloqueada por padrão;
- workspace descartável por execução;
- limites de CPU/memória/tempo;
- allowlist de variáveis de ambiente;
- coleta de logs/artifacts;
- nenhuma credencial de produção dentro do workspace do agente.

## Ordem Recomendada

**Status real (2026-09-29): itens 1-5 concluídos, live em produção** (Render + Vercel + Neon + Upstash + Groq — ver `PROGRESS.md`, seção "Deploy real em produção", para os bugs reais encontrados e corrigidos ao longo desse processo, incluindo `API_PORT` e o proxy `/api/*`).

| Ordem | Trabalho | Status |
|---|---|---|
| 1 | Configurar Neon/Upstash/Render/Vercel com `.env.production.example` | concluído |
| 2 | Validar migrations/seed em banco Neon | concluído |
| 3 | Deploy API Render e health check | concluído |
| 4 | Deploy Web Vercel com `API_INTERNAL_URL` correto | concluído (via Route Handler, não `rewrites()` — ver `PROGRESS.md`) |
| 5 | Configurar `AI_PROVIDER=gemini` ou `groq` e validar uma execução real | concluído (Groq) |
| 6 | Implementar runner real seguro para `run_command` e execuções arbitrárias | pendente, decisão deliberada de não avançar por enquanto (ver `PROGRESS.md`, "O que falta") |

## Demo pública: limites de IA e proteção

As contas de demonstração são públicas (o login já vem preenchido), então qualquer visitante age como `tech-lead`/`dev`. Duas proteções, ambas configuráveis no Render (Environment):

**1. Teto de gasto de IA.** Com um provider real (ex. `AI_PROVIDER=groq`) e sem limites, um visitante ou robô consegue disparar execuções sem parar. Valores recomendados:

| Variável | Valor | Efeito |
|---|---|---|
| `AI_ORG_DAILY_TOKEN_LIMIT` | `300000` | teto da organização inteira em 24h (≈ 30 a 140 execuções, conforme o tamanho do contexto) |
| `AI_ORG_DAILY_COST_LIMIT_USD` | `1` | teto de custo estimado da organização em 24h (pior caso ≈ US$ 30/mês) |
| `AI_USER_DAILY_TOKEN_LIMIT` | `100000` | por usuário: uma conta compartilhada não consome tudo sozinha |
| `AI_USER_DAILY_COST_LIMIT_USD` | `0.30` | idem, em custo |

Ao atingir qualquer teto, `POST /tasks/:id/agent-runs` responde 429 e a tela da tarefa mostra a mensagem. O uso consumido aparece em `/ai-usage` ("Meu uso" e totais). Uma execução com o provider `mock` gasta cerca de 2,1 mil tokens / US$ 0,017 (estimado); com provider real o consumo depende do modelo e do contexto — ajuste os tetos olhando `/ai-usage` depois de alguns dias.

**2. Projeto de demonstração protegido.** Por padrão o projeto do seed (`forge-web-app`) e as tarefas dele não podem ser editados nem excluídos por ninguém (a API responde 403 e a UI esconde os botões); criar tarefas e disparar execuções continua permitido. Projetos criados pelos visitantes são livres. Para mudar a lista: `PROTECTED_PROJECT_SLUGS=forge-web-app,outro-slug`; valor vazio (`PROTECTED_PROJECT_SLUGS=`) desliga a proteção. A proteção existe porque o seed **não** recria projeto nem tarefas apagados quando a organização já existe (ele só garante usuários, ambientes e conhecimento): restaurar a demonstração exigiria recriar o banco (`db:migrate` + `db:seed` num banco novo).

**3. Contas de demonstração e "Resetar demo".** Os e-mails que terminam em `@acme-platform.example` (`PROTECTED_USER_EMAIL_SUFFIXES`, vazio desliga) não podem ser removidos nem ter o papel alterado, não ativam 2FA, não travam por tentativas de login (a senha é pública) e não enxergam/encerram sessões de outros visitantes. Quem entra como `admin@acme-platform.example` tem *Configurações → Demonstração → Resetar demonstração*, que apaga o que visitantes criaram (projetos, usuários, convites, datasets), restaura os agentes, limpa as políticas de ferramentas e revoga as sessões dos outros; o projeto de exemplo e as contas demo ficam. Uma organização real nunca é afetada (só vale para admin de conta demo).

## Segurança: variáveis de sessão e 2FA

| Variável | Padrão | Efeito |
|---|---|---|
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | validade do JWT de acesso (renovado sozinho pelo refresh) |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | validade deslizante do refresh token (rotaciona a cada renovação) |
| `SESSION_MAX_AGE_DAYS` | `30` | teto absoluto da sessão: depois disso é preciso entrar de novo |
| `TOTP_ENCRYPTION_KEY` | derivada de `JWT_SECRET` | chave do AES-256-GCM que protege o segredo do 2FA no banco. Defina uma própria: girar o `JWT_SECRET` sem ela invalida os 2FA já configurados |
| `TRUST_PROXY_HOPS` | `1` | quantos proxies confiar para descobrir o IP do cliente (usado nos limites de taxa e na lista de sessões). Em Render atrás da Vercel o IP exibido pode ser interno (`10.x`): aumente (2, 3…) até aparecer o IP real |
| `AI_MOCK_STREAM_DELAY_MS` | `0` | pausa entre pedaços do streaming do provedor mock (ex.: `40` para ver o texto aparecendo na demo) |

A API confia em um proxy (`trust proxy = 1`) para enxergar o IP real (Render/Vercel); os limites de taxa (login por e-mail, convites e refresh por IP) são em memória, por instância. O site responde com CSP restrita, `X-Frame-Options: DENY`, `nosniff` e HSTS (produção).
