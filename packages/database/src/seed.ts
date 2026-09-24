import { createDatabase } from './client.ts';
import { DEMO_PASSWORD, runSeed } from './seed/run-seed.ts';

/**
 * Entrypoint CLI (`pnpm db:seed`). A lógica de seeding em si vive em
 * `./seed/run-seed.ts` como uma função pura sobre um `Database` já aberto,
 * para poder ser reutilizada por testes de integração (PGlite efêmero) sem
 * duplicar a árvore de inserts — ver `./seed/run-seed.integration.test.ts`.
 */
async function main() {
  const { db, close } = createDatabase();

  const summary = await runSeed(db);

  if (summary.alreadySeeded) {
    console.log(`Organização "acme-platform" já existe (id=${summary.organizationId}); seed demo conferido/atualizado.`);
    await close();
    return;
  }

  console.log('Seed aplicado com sucesso:');
  console.log(`  organization: Acme Platform (${summary.organizationId})`);
  console.log(
    `  users: tech-lead@acme-platform.example, dev@acme-platform.example, platform@acme-platform.example ` +
      `(senha de demo: "${DEMO_PASSWORD}")`,
  );
  console.log(`  project: Forge Web App (${summary.projectId})`);
  console.log(`  repository: acme-platform/acme-platform-web (${summary.repositoryId})`);
  console.log(`  demo task: "Estornos aparecem como cobrança positiva na fatura" (${summary.demoTaskId})`);
  console.log(`  workspace: ${summary.workspaceId}`);
  console.log(`  agentRun: ${summary.agentRunId} (status: completed, 6 steps)`);
  console.log(`  testRun: ${summary.testRunId} (status: passed)`);
  console.log(`  pullRequest: ${summary.pullRequestId} (status: merged)`);
  console.log(`  approval: ${summary.approvalId} (status: approved)`);

  await close();
}

main().catch((error: unknown) => {
  console.error('Falha ao aplicar seed:', error);
  process.exitCode = 1;
});
