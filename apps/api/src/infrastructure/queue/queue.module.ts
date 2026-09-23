import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { env } from '../config/env.js';
import { BullMqQueueAdapter } from './bullmq-queue.adapter.js';
import { InMemoryQueueAdapter } from './in-memory-queue.adapter.js';
import { QUEUE_ADAPTER, type QueueAdapter } from './queue.types.js';

@Global()
@Module({
  providers: [
    {
      provide: QUEUE_ADAPTER,
      useFactory: (): QueueAdapter =>
        env.REDIS_URL ? new BullMqQueueAdapter(env.REDIS_URL) : new InMemoryQueueAdapter(),
    },
  ],
  exports: [QUEUE_ADAPTER],
})
export class QueueModule implements OnModuleDestroy {
  constructor(@Inject(QUEUE_ADAPTER) private readonly queueAdapter: QueueAdapter) {}

  async onModuleDestroy(): Promise<void> {
    await this.queueAdapter.close();
  }
}
