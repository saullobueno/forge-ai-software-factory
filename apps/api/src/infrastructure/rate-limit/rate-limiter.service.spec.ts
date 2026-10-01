import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RateLimiterService } from './rate-limiter.service.js';

describe('RateLimiterService', () => {
  it('conta só ocorrências dentro da janela deslizante', () => {
    const limiter = new RateLimiterService();
    limiter.record('k', 1000, 0);
    limiter.record('k', 1000, 400);
    expect(limiter.count('k', 1000, 500)).toBe(2);
    expect(limiter.count('k', 1000, 1100)).toBe(1);
    expect(limiter.count('k', 1000, 1500)).toBe(0);
  });

  it('bloqueia com 429 ao atingir o máximo e informa quando tentar de novo', () => {
    const limiter = new RateLimiterService();
    limiter.consume('login', 2, 60_000);
    limiter.consume('login', 2, 60_000);
    let caught: HttpException | undefined;
    try {
      limiter.consume('login', 2, 60_000);
    } catch (error) {
      caught = error as HttpException;
    }
    expect(caught).toBeDefined();
    expect(caught!.getStatus()).toBe(429);
    expect((caught!.getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
  });

  it('chaves são independentes e reset libera', () => {
    const limiter = new RateLimiterService();
    limiter.consume('a', 1, 60_000);
    expect(() => limiter.consume('a', 1, 60_000)).toThrow();
    expect(() => limiter.consume('b', 1, 60_000)).not.toThrow();
    limiter.reset('a');
    expect(() => limiter.consume('a', 1, 60_000)).not.toThrow();
  });

  it('assertBelow não registra ocorrência', () => {
    const limiter = new RateLimiterService();
    limiter.assertBelow('x', 1, 60_000);
    limiter.assertBelow('x', 1, 60_000);
    expect(limiter.count('x', 60_000)).toBe(0);
  });
});
