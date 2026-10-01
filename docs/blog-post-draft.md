# Rascunho de artigo — "Governando agentes de IA: o que aprendi construindo o Forge"

> Rascunho técnico para publicação (blog/LinkedIn). Ajuste o tom e acrescente 2–3 capturas de `docs/screenshots`.

## Gancho

Dar a um agente de IA a capacidade de escrever código é fácil. Difícil é responder, com evidência, às perguntas que
qualquer time faz antes de confiar nele: *quem pediu? o que ele tentou fazer? quem aprovou? quanto custou? dá para voltar atrás?*
O Forge é um projeto de portfólio que tenta responder essas perguntas de ponta a ponta — e o que mais aprendi foi
sobre **fronteiras**, não sobre prompts.

## 1. A decisão mais importante: a política não vive no prompt

O agente *propõe* ferramentas; quem *decide* é uma função pura (`authorizeToolCall`): confere o tenant, o papel do
usuário que disparou e a política da ferramenta. Leitura roda sozinha; escrita, comando e Git pedem aprovação humana;
comando destrutivo é sempre negado; ferramenta desconhecida também (falha fechada). Como é uma função pura, é testada
exaustivamente — e a mesma matriz alimenta a tela de Configurações.

Uma regra que me poupou de uma classe inteira de brechas: **a organização só pode restringir a política, nunca afrouxar**.
O efetivo é `max(padrão, ajuste)`. Mesmo que um dado ruim entre no banco, a leitura o ignora.

## 2. Orquestrador por portas

O pipeline (planejar → explorar → implementar → testar → revisar → documentar) mora num pacote que não conhece banco,
fila nem HTTP. A API implementa as portas com Drizzle/NestJS. Resultado prático: o orquestrador é testado com um store
em memória, e features novas (provedor de IA por projeto, streaming de tokens, ajustes de política) entraram como
métodos *opcionais* das portas, sem quebrar nenhum teste antigo.

## 3. Multi-tenant sem RLS, com disciplina

Todo repositório recebe o `organizationId` do usuário autenticado e o aplica no `WHERE`; recurso de outra organização
dá 404 (não 403). Sem RLS no banco, a garantia é de aplicação — por isso cada módulo tem um teste e2e cross-tenant. Foi
tedioso e valeu: os testes pegaram vazamentos reais durante o desenvolvimento.

## 4. Testes reais em vez de mocks

PGlite (Postgres em WASM) localmente e Postgres de verdade em produção, com as mesmas migrações. Os e2e sobem o
`AppModule` completo contra um banco temporário. Custo: lentidão sob carga e timeouts generosos. Benefício: nenhum
teste verde escondendo um bug de SQL.

## 5. Sessões que dá para revogar

Troquei o JWT de 8 horas por um acesso de 15 minutos com `sid`, refresh token opaco **rotativo** (só o hash no banco)
e detecção de reuso: apresentar o token anterior fora de uma janela de 15 s revoga a sessão inteira. O papel vem do
banco a cada requisição — rebaixar alguém vale imediatamente. Somei 2FA TOTP (RFC 6238 implementado com `node:crypto`,
validado com os vetores da RFC) e códigos de recuperação.

## 6. O que deixei de fora de propósito

IA real é opcional (padrão: mock determinístico), escrita é simulada, Git é mock, não há execução real de comandos.
Para um portfólio público isso é uma *feature*: ninguém paga conta nem corre risco ao testar. Limites diários de tokens
e custo protegem o caso em que um provedor real é ligado.

## 7. Operar: observabilidade e "resetar demo"

Traces, métricas e logs via OpenTelemetry (dashboard Grafana em `docs/observability`). E uma lição de produto: uma demo
pública precisa de um botão que a devolva ao estado inicial — visitantes mexem em tudo.

## Fecho

O ganho não foi um agente "mais inteligente", e sim um sistema em que cada ação de um agente é **autorizada, auditada
e reversível**. Código: https://github.com/saullobueno/forge-ai-software-factory · Demo: https://forge-ai-software-factory.vercel.app
