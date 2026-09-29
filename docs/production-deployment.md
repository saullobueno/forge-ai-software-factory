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

As chamadas de agente já persistem uso básico em `ai_messages`/`ai_usages` (provider, modelo, tokens, custo estimado e resposta resumida). `GET /ai-usage/summary` e `/ai-usage` já dão uma leitura operacional inicial de tokens/custo/latência média por organização. Para tráfego real, configure `AI_ORG_DAILY_TOKEN_LIMIT` e/ou `AI_ORG_DAILY_COST_LIMIT_USD` como teto simples por organização nas últimas 24h. Ainda faltam limites por usuário e séries históricas de latência/custo.

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
