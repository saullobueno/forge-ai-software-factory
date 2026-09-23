# Acme Platform — Web

Biblioteca interna de faturamento da Acme Platform: formatação de valores
monetários e composição de resumos de fatura, usada pelo dashboard de
cobrança do time de billing.

## Módulos

- `src/lib/format-currency.ts` — formata um valor em centavos como string
  monetária localizada (BRL/USD/EUR), preservando o sinal para estornos e
  créditos.
- `src/lib/invoice.ts` — soma os itens de uma fatura e monta o resumo
  textual exibido ao cliente.
- `src/index.ts` — ponto de entrada público do pacote.

## Desenvolvimento

```bash
npm install
npm test
```

## Nota

Este diretório é um snapshot estático de repositório usado como dado de
demonstração pelo Forge (`FORGE-SPECIFICATION.md` §21 — Modo Demo). Não faz
parte do workspace pnpm do monorepo do Forge.
