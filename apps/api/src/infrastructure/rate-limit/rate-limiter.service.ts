import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Limitador de taxa em memória (janela deslizante), por processo — suficiente
 * para uma instância única (Render free); com várias réplicas precisaria de um
 * contador compartilhado (Redis). Chaves antigas são podadas a cada uso.
 */
@Injectable()
export class RateLimiterService {
  private readonly hits = new Map<string, number[]>();

  private prune(key: string, windowMs: number, now: number): number[] {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length === 0) this.hits.delete(key);
    else this.hits.set(key, recent);
    return recent;
  }

  /** Registra uma ocorrência. */
  record(key: string, windowMs: number, now = Date.now()): void {
    const recent = this.prune(key, windowMs, now);
    recent.push(now);
    this.hits.set(key, recent);
  }

  count(key: string, windowMs: number, now = Date.now()): number {
    return this.prune(key, windowMs, now).length;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Segundos até a ocorrência mais antiga da janela sair (para `Retry-After`). */
  retryAfterSeconds(key: string, windowMs: number, now = Date.now()): number {
    const recent = this.prune(key, windowMs, now);
    const oldest = recent[0];
    return oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
  }

  /** Lança 429 se já houve `max` ocorrências na janela; senão, registra esta. */
  consume(key: string, max: number, windowMs: number, message = 'Muitas requisições. Tente novamente em instantes.'): void {
    this.assertBelow(key, max, windowMs, message);
    this.record(key, windowMs);
  }

  /** Lança 429 se já há `max` ocorrências na janela (sem registrar). */
  assertBelow(key: string, max: number, windowMs: number, message = 'Muitas tentativas. Tente novamente em instantes.'): void {
    if (this.count(key, windowMs) >= max) {
      throw new HttpException(
        { statusCode: 429, message, error: 'Too Many Requests', retryAfterSeconds: this.retryAfterSeconds(key, windowMs) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
