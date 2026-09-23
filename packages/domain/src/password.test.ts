import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('hashPassword / verifyPassword', () => {
  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const [a, b] = await Promise.all([hashPassword('demo1234'), hashPassword('demo1234')]);
    expect(a).not.toBe(b);
  });

  it('produz um hash no formato "<salt-hex>:<hash-hex>"', async () => {
    const hash = await hashPassword('demo1234');
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('aceita a senha correta', async () => {
    const hash = await hashPassword('demo1234');
    await expect(verifyPassword('demo1234', hash)).resolves.toBe(true);
  });

  it('rejeita uma senha errada', async () => {
    const hash = await hashPassword('demo1234');
    await expect(verifyPassword('senha-errada', hash)).resolves.toBe(false);
  });

  it('rejeita um hash malformado sem lançar', async () => {
    await expect(verifyPassword('demo1234', 'nao-e-um-hash-valido')).resolves.toBe(false);
    await expect(verifyPassword('demo1234', '')).resolves.toBe(false);
  });
});
