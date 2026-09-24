# Forge Production Deployment Checklist

Última atualização: 2026-09-24.

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
API_PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
REDIS_URL=rediss://default:PASSWORD@HOST:6379
JWT_SECRET=<segredo-longo-aleatorio>
```

Em produção, a API agora falha cedo se `DATABASE_URL`, `REDIS_URL` ou um `JWT_SECRET` real não estiverem definidos.

Comando de build/start sugerido para Render:

```bash
pnpm install --frozen-lockfile
pnpm --filter @forge/api build
pnpm --filter @forge/database db:migrate
pnpm --filter @forge/database db:seed
pnpm --filter @forge/api start:prod
```

Para uma primeira demo, o seed pode ser aceitável. Para ambiente público, substitua por bootstrap administrativo controlado antes de abrir acesso.

## Web

Configure no deploy do app web:

```bash
API_INTERNAL_URL=https://<sua-api-render>.onrender.com
```

Ponto importante: o Next.js resolve `rewrites()` durante o build. Defina `API_INTERNAL_URL` antes do build da Vercel, não apenas depois no runtime.

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

As chamadas de agente já persistem uso básico em `ai_messages`/`ai_usages` (provider, modelo, tokens, custo estimado e resposta resumida). Antes de abrir tráfego real amplo, ainda faltam limites por organização/usuário e dashboards/consultas operacionais de custo/latência.

## Runner Real

`write_file` e `apply_patch` já aplicam mudanças reais depois de aprovação humana, mas somente em cópia isolada do repositório. `run_command` e `run_tests` continuam simulados.

Para executar comandos reais em produção, implemente um runner isolado fora do host principal:

- rede bloqueada por padrão;
- workspace descartável por execução;
- limites de CPU/memória/tempo;
- allowlist de variáveis de ambiente;
- coleta de logs/artifacts;
- nenhuma credencial de produção dentro do workspace do agente.

## Ordem Recomendada

| Ordem | Trabalho | Status |
|---|---|---|
| 1 | Configurar Neon/Upstash/Render/Vercel com `.env.production.example` | pronto para configuração |
| 2 | Validar migrations/seed em banco Neon de staging | pendente |
| 3 | Deploy API Render e health check | pendente |
| 4 | Deploy Web Vercel com `API_INTERNAL_URL` correto | pendente |
| 5 | Configurar `AI_PROVIDER=gemini` ou `groq` e validar uma execução de staging | pronto para configuração |
| 6 | Implementar runner real seguro para comandos/testes | pendente |
