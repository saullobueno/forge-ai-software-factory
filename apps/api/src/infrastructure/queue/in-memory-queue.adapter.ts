import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { QueueAdapter, QueueJobHandler } from './queue.types.js';

/**
 * Fila em processo, sem dependências externas. Usada por padrão quando
 * REDIS_URL não está configurado (ver [[BullMqQueueAdapter]] para produção).
 * Jobs não sobrevivem a um restart do processo — aceitável para o modo demo
 * do Forge, nunca para produção.
 */
export class InMemoryQueueAdapter implements QueueAdapter {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(InMemoryQueueAdapter.name);

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  async enqueue<TPayload>(queueName: string, payload: TPayload): Promise<void> {
    queueMicrotask(() => {
      if (this.emitter.listenerCount(queueName) === 0) {
        this.logger.warn(`Nenhum handler registrado para a fila "${queueName}"`);
        return;
      }
      this.emitter.emit(queueName, payload);
    });
  }

  registerHandler<TPayload>(queueName: string, handler: QueueJobHandler<TPayload>): void {
    this.emitter.on(queueName, (payload: TPayload) => {
      handler(payload).catch((error: unknown) => {
        this.logger.error(`Falha ao processar job da fila "${queueName}"`, error as Error);
      });
    });
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}
