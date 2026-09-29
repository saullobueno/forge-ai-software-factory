#!/usr/bin/env node
// Falha o processo (exit 1) se alguma rota de `apps/web` exceder seu budget
// de tamanho de bundle JavaScript, lendo o diagnóstico real que o próprio
// `next build` (Turbopack, Next.js 16) já grava em
// `.next/diagnostics/route-bundle-stats.json` — não existe uma tabela
// "First Load JS" impressa no stdout do build sob Turbopack (isso era um
// formato específico do builder webpack de versões anteriores), mas o
// mesmo dado (bytes de JS não comprimido por rota, já somando os chunks
// compartilhados) é gravado nesse arquivo incondicionalmente a cada build
// (`next/dist/build/route-bundle-stats.js`, chamado sem flag/config extra).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBundleBudgets } from './bundle-budgets.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const statsPath = path.join(webRoot, '.next', 'diagnostics', 'route-bundle-stats.json');

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  let raw;
  try {
    raw = await readFile(statsPath, 'utf-8');
  } catch (error) {
    console.error(`[bundle-budget] não foi possível ler ${statsPath}.`);
    console.error('[bundle-budget] rode "pnpm --filter @forge/web build" antes de verificar os budgets.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const stats = JSON.parse(raw);
  const results = evaluateBundleBudgets(stats).sort((a, b) => b.actualBytes - a.actualBytes);

  let hasViolation = false;
  for (const result of results) {
    const status = result.withinBudget ? 'OK' : 'EXCEDEU';
    if (!result.withinBudget) hasViolation = true;
    console.log(
      `[bundle-budget] ${status.padEnd(7)} ${result.route.padEnd(55)} ${formatKB(result.actualBytes).padStart(10)}  (budget ${formatKB(result.budgetBytes)})`,
    );
  }

  if (hasViolation) {
    console.error('\n[bundle-budget] budget de bundle JavaScript excedido em uma ou mais rotas (ver acima).');
    process.exitCode = 1;
    return;
  }

  console.log(`\n[bundle-budget] todas as ${results.length} rotas dentro do budget de bundle JavaScript.`);
}

await main();
