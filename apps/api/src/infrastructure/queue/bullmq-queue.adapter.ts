import { Logger } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { QueueAdapter, QueueJobHandler } from './queue.types.js';

/**
 * Implementação real sobre Redis/BullMQ, usada quando REDIS_URL está
 * definido. Mantém o mesmo contrato de [[InMemoryQueueAdapter]] para que o
 * restante da aplicação seja agnóstico à infraestrutura.
 */
export class BullMqQueueAdapter implements QueueAdapter {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly logger = new Logger(BullMqQueueAdapter.name);

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  private getQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, { connection: this.connection });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async enqueue<TPayload>(queueName: string, payload: TPayload): Promise<void> {
    await this.getQueue(queueName).add(queueName, payload);
  }

  registerHandler<TPayload>(queueName: string, handler: QueueJobHandler<TPayload>): void {
    const worker = new Worker<TPayload>(
      queueName,
      async (job: Job<TPayload>) => {
        await handler(job.data);
      },
      { connection: this.connection },
    );
    worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.id ?? '?'} falhou na fila "${queueName}"`, error);
    });
    this.workers.push(worker);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection.quit();
  }
}
