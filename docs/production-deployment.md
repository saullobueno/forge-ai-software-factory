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
| IA real | Gemini/Groq/Anthropic | Pendente de implementação de provider real |

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

Hoje o orquestrador usa `MockAiProvider` determinístico. `ANTHROPIC_API_KEY` existe como ponto de extensão documentado, mas ainda não há provider real conectado; se essa variável for definida agora, a API falha cedo por design.

Próxima implementação segura:

1. Adicionar `AI_PROVIDER` (`mock`, `gemini`, `groq`, etc.) e schemas de env por provider.
2. Implementar providers reais atrás da interface `AiProvider` em `packages/ai`.
3. Manter `mock` como default local/teste.
4. Gravar histórico de chamadas/custo/latência antes de habilitar em produção.

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
| 5 | Implementar provider IA real com feature flag | pendente |
| 6 | Implementar runner real seguro para comandos/testes | pendente |
