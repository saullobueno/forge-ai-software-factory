import { memberRoleSchema, permissionSchema } from '@forge/types';
import { describe, expect, it } from 'vitest';
import { hasPermission } from './permissions.ts';

describe('hasPermission', () => {
  it('admin tem todas as permissões do sistema', () => {
    for (const permission of permissionSchema.options) {
      expect(hasPermission('admin', permission)).toBe(true);
    }
  });

  it('platform_engineer gerencia ambientes e políticas, mas não membros nem escreve no projeto', () => {
    expect(hasPermission('platform_engineer', 'environment:deploy')).toBe(true);
    expect(hasPermission('platform_engineer', 'policy:manage')).toBe(true);
    expect(hasPermission('platform_engineer', 'audit_log:read')).toBe(true);
    expect(hasPermission('platform_engineer', 'member:manage')).toBe(false);
    expect(hasPermission('platform_engineer', 'project:write')).toBe(false);
  });

  it('tech_lead decompõe iniciativas e aprova execuções, mas não faz deploy nem gerencia membros', () => {
    expect(hasPermission('tech_lead', 'project:write')).toBe(true);
    expect(hasPermission('tech_lead', 'task:manage')).toBe(true);
    expect(hasPermission('tech_lead', 'agent_run:approve')).toBe(true);
    expect(hasPermission('tech_lead', 'ai_playground:use')).toBe(true);
    expect(hasPermission('tech_lead', 'environment:deploy')).toBe(false);
    expect(hasPermission('tech_lead', 'member:manage')).toBe(false);
  });

  it('developer dispara execuções de IA e gerencia tarefas, mas não aprova nem faz deploy', () => {
    expect(hasPermission('developer', 'task:manage')).toBe(true);
    expect(hasPermission('developer', 'agent_run:trigger')).toBe(true);
    expect(hasPermission('developer', 'agent_run:approve')).toBe(false);
    expect(hasPermission('developer', 'environment:deploy')).toBe(false);
    expect(hasPermission('developer', 'policy:manage')).toBe(false);
  });

  it('qa_engineer lê tarefas e dispara execuções, mas não lê a configuração completa do projeto', () => {
    expect(hasPermission('qa_engineer', 'task:read')).toBe(true);
    expect(hasPermission('qa_engineer', 'agent_run:trigger')).toBe(true);
    expect(hasPermission('qa_engineer', 'project:read')).toBe(false);
    expect(hasPermission('qa_engineer', 'task:manage')).toBe(false);
    expect(hasPermission('qa_engineer', 'agent_run:approve')).toBe(false);
  });

  it('product_manager gerencia tarefas a partir de specs, mas não dispara execuções de IA nem aprova', () => {
    expect(hasPermission('product_manager', 'task:manage')).toBe(true);
    expect(hasPermission('product_manager', 'agent_run:trigger')).toBe(false);
    expect(hasPermission('product_manager', 'agent_run:approve')).toBe(false);
    expect(hasPermission('product_manager', 'environment:deploy')).toBe(false);
  });

  it('agent_run:cancel segue o mesmo conjunto de papéis de agent_run:trigger', () => {
    for (const role of memberRoleSchema.options) {
      expect(hasPermission(role, 'agent_run:cancel')).toBe(hasPermission(role, 'agent_run:trigger'));
    }
  });

  it('product_manager não dispara nem cancela execuções de IA', () => {
    expect(hasPermission('product_manager', 'agent_run:trigger')).toBe(false);
    expect(hasPermission('product_manager', 'agent_run:cancel')).toBe(false);
  });

  it('member:manage é exclusivo de admin', () => {
    for (const role of memberRoleSchema.options) {
      expect(hasPermission(role, 'member:manage')).toBe(role === 'admin');
    }
  });

  it('ai_playground:use fica restrito a papéis que governam modelos e arquitetura', () => {
    for (const role of memberRoleSchema.options) {
      expect(hasPermission(role, 'ai_playground:use')).toBe(
        role === 'admin' || role === 'platform_engineer' || role === 'tech_lead',
      );
    }
  });

  it('todo role tem ao menos task:read (leitura mínima para operar)', () => {
    for (const role of memberRoleSchema.options) {
      expect(hasPermission(role, 'task:read')).toBe(true);
    }
  });

  it('project:read não é universal — qa_engineer não lê a configuração completa do projeto', () => {
    expect(hasPermission('qa_engineer', 'project:read')).toBe(false);
    for (const role of memberRoleSchema.options) {
      if (role === 'qa_engineer') continue;
      expect(hasPermission(role, 'project:read')).toBe(true);
    }
  });
});
