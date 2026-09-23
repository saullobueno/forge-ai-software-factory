import { eq } from 'drizzle-orm';
import { hashPassword } from '@forge/domain';
import { createDatabase } from './client';
import { organizations, projects, tasks, users } from './schema/index';

/**
 * Senha de demonstração para os dois usuários seedados — projeto de
 * portfólio local, sem dados sensíveis reais. Documentada em `README.md`.
 */
const DEMO_PASSWORD = 'demo1234';

/**
 * Popula um cenário mínimo e coerente: 1 organization, 2 users (com senha
 * de demo), 1 project e 2 tasks. Serve de base para a Fase 3 (repositório
 * demo). Idempotente por slug — rodar de novo contra o mesmo banco não
 * duplica dados nem falha.
 */
async function main() {
  const { db, close } = createDatabase();

  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, 'acme-platform'),
  });

  if (existing) {
    console.log(`Organização "acme-platform" já existe (id=${existing.id}); nada a fazer.`);
    await close();
    return;
  }

  const [organization] = await db
    .insert(organizations)
    .values({ name: 'Acme Platform', slug: 'acme-platform' })
    .returning();
  if (!organization) throw new Error('Falha ao inserir a organization de seed');

  const demoPasswordHash = await hashPassword(DEMO_PASSWORD);

  const [techLead] = await db
    .insert(users)
    .values({
      organizationId: organization.id,
      email: 'tech-lead@acme-platform.example',
      name: 'Ana Tech Lead',
      role: 'tech_lead',
      passwordHash: demoPasswordHash,
    })
    .returning();
  if (!techLead) throw new Error('Falha ao inserir o tech lead de seed');

  const [developer] = await db
    .insert(users)
    .values({
      organizationId: organization.id,
      email: 'dev@acme-platform.example',
      name: 'Bruno Developer',
      role: 'developer',
      passwordHash: demoPasswordHash,
    })
    .returning();
  if (!developer) throw new Error('Falha ao inserir o developer de seed');

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: organization.id,
      name: 'Forge Web App',
      slug: 'forge-web-app',
      description: 'Monorepo TypeScript de demonstração do Forge (Fase 3).',
      techProfile: {
        languages: ['typescript'],
        frameworks: ['next.js', 'nestjs'],
        packageManager: 'pnpm',
      },
    })
    .returning();
  if (!project) throw new Error('Falha ao inserir o project de seed');

  await db.insert(tasks).values([
    {
      organizationId: organization.id,
      projectId: project.id,
      title: 'Configurar autenticação de usuários',
      description: 'Adicionar login/registro com sessão persistida.',
      acceptanceCriteria: 'Usuário consegue logar e permanecer autenticado entre sessões.',
      priority: 'high',
      labels: ['auth', 'backend'],
      assigneeId: developer.id,
      status: 'ready',
    },
    {
      organizationId: organization.id,
      projectId: project.id,
      title: 'Revisar arquitetura de filas',
      description: 'Avaliar uso de BullMQ vs. fila em memória em produção.',
      acceptanceCriteria: 'ADR documentando a decisão.',
      priority: 'medium',
      labels: ['arquitetura'],
      assigneeId: techLead.id,
      status: 'backlog',
    },
  ]);

  console.log('Seed aplicado com sucesso:');
  console.log(`  organization: ${organization.name} (${organization.id})`);
  console.log(`  users: ${techLead.email}, ${developer.email} (senha de demo: "${DEMO_PASSWORD}")`);
  console.log(`  project: ${project.name} (${project.id})`);
  console.log('  tasks: 2');

  await close();
}

main().catch((error: unknown) => {
  console.error('Falha ao aplicar seed:', error);
  process.exitCode = 1;
});
