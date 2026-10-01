# ADR 0008 — IA simulada por padrão

**Contexto.** É um projeto de portfólio: precisa funcionar sem chaves, sem custo e de forma determinística nos testes.

**Decisão.** `MockAiProvider` é o padrão (determinístico, sem rede, com streaming simulado); Groq/Gemini/Anthropic entram por variáveis de ambiente e cada projeto escolhe o provedor. Ferramentas de escrita são **simuladas** (o resultado vem do provedor, nada é gravado), Git/PR usam `MockGitProvider` e não há execução real de comandos.

**Consequências.** A demo é segura e barata (limites diários de tokens/custo mesmo com provedor real). Fora de escopo por decisão: embeddings por rede, Docker/VPS reais e GitHub real.
