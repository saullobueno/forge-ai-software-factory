import { describe, expect, it } from 'vitest';
import { redactSensitiveValues } from './redaction.js';

describe('redactSensitiveValues', () => {
  it('mascara chaves sensíveis sem alterar métricas seguras', () => {
    const input = {
      password: 'demo1234',
      authToken: 'jwt-value',
      totalTokens: 123,
      nested: {
        api_key: 'secret-key',
        authorization: 'Bearer abc',
        cookie: 'forge_session=abc',
      },
      events: [{ privateKey: 'pem-value', status: 'ok' }],
    };

    const redacted = redactSensitiveValues(input);

    expect(redacted).toEqual({
      password: '[REDACTED]',
      authToken: '[REDACTED]',
      totalTokens: 123,
      nested: {
        api_key: '[REDACTED]',
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
      },
      events: [{ privateKey: '[REDACTED]', status: 'ok' }],
    });
    expect(input.nested.api_key).toBe('secret-key');
  });

  it('lida com referências circulares sem lançar erro', () => {
    const input: { name: string; self?: unknown } = { name: 'trace' };
    input.self = input;

    expect(redactSensitiveValues(input)).toEqual({
      name: 'trace',
      self: '[Circular]',
    });
  });
});
