import { describe, expect, it } from 'vitest';
import { InMemoryQueueAdapter } from './in-memory-queue.adapter.js';

describe('InMemoryQueueAdapter', () => {
  it('entrega o payload ao handler registrado para a fila', async () => {
    const adapter = new InMemoryQueueAdapter();
    const received: unknown[] = [];

    adapter.registerHandler<{ taskId: string }>('agent-runs', async (payload) => {
      received.push(payload);
    });

    await adapter.enqueue('agent-runs', { taskId: 'task-1' });

    await new Promise((resolve) => setImmediate(resolve));

    expect(received).toEqual([{ taskId: 'task-1' }]);

    await adapter.close();
  });

  it('não lança quando não há handler registrado', async () => {
    const adapter = new InMemoryQueueAdapter();
    await expect(adapter.enqueue('sem-handler', {})).resolves.toBeUndefined();
    await adapter.close();
  });
});
