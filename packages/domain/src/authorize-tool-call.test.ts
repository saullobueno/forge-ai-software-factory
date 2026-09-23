import { describe, expect, it } from 'vitest';
import { authorizeToolCall } from './authorize-tool-call.ts';

const orgA = '11111111-1111-1111-1111-111111111111';
const orgB = '22222222-2222-2222-2222-222222222222';

describe('authorizeToolCall', () => {
  it('nega quando o recurso pertence a outra organização, independentemente do papel', () => {
    const result = authorizeToolCall({
      actor: { role: 'admin', organizationId: orgA },
      resourceOrganizationId: orgB,
      toolName: 'read_file',
    });

    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/organização/i);
  });

  it('nega isolamento de tenant mesmo para uma ferramenta que decideToolPolicy sempre permitiria', () => {
    // read_file é sempre "allow" em decideToolPolicy isoladamente — mas
    // tenant errado tem que vencer isso.
    const result = authorizeToolCall({
      actor: { role: 'admin', organizationId: orgA },
      resourceOrganizationId: orgB,
      toolName: 'list_files',
    });
    expect(result.decision).toBe('deny');
  });

  it('nega quando o papel não tem a permissão exigida pela ferramenta (mesmo tenant certo)', () => {
    // qa_engineer não tem agent_run:approve nem permissão de escrita —
    // create_pull_request exige agent_run:trigger, que qa_engineer TEM;
    // usamos product_manager, que não tem agent_run:trigger.
    const result = authorizeToolCall({
      actor: { role: 'product_manager', organizationId: orgA },
      resourceOrganizationId: orgA,
      toolName: 'write_file',
    });

    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/permissão/i);
  });

  it('nega ferramenta de leitura de projeto para um papel sem project:read (qa_engineer)', () => {
    const result = authorizeToolCall({
      actor: { role: 'qa_engineer', organizationId: orgA },
      resourceOrganizationId: orgA,
      toolName: 'read_file',
    });

    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/permissão/i);
  });

  it('permite ferramenta de leitura para um papel com project:read dentro do próprio tenant (delega para decideToolPolicy)', () => {
    const result = authorizeToolCall({
      actor: { role: 'developer', organizationId: orgA },
      resourceOrganizationId: orgA,
      toolName: 'read_file',
    });

    expect(result).toEqual({
      decision: 'allow',
      reason: 'Ferramenta "read_file" é somente leitura/inspeção.',
    });
  });

  it('caminho feliz: papel com permissão, tenant correto, delega corretamente para decideToolPolicy (require_approval)', () => {
    const result = authorizeToolCall({
      actor: { role: 'developer', organizationId: orgA },
      resourceOrganizationId: orgA,
      toolName: 'apply_patch',
    });

    expect(result.decision).toBe('require_approval');
  });

  it('delega para decideToolPolicy mesmo quando este bloqueia (comando destrutivo)', () => {
    const result = authorizeToolCall({
      actor: { role: 'admin', organizationId: orgA },
      resourceOrganizationId: orgA,
      toolName: 'run_command',
      args: { command: 'rm -rf /' },
    });

    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/destrutivo/i);
  });

  it('RBAC é avaliado antes da política — papel sem permissão nunca chega a decideToolPolicy', () => {
    // Um comando não destrutivo normalmente vira require_approval em
    // decideToolPolicy; mas se o papel não tem a permissão da ferramenta,
    // o resultado tem que ser deny por RBAC, não require_approval.
    const result = authorizeToolCall({
      actor: { role: 'product_manager', organizationId: orgA },
      resourceOrganizationId: orgA,
      toolName: 'run_command',
      args: { command: 'pnpm test' },
    });

    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/permissão/i);
  });
});
