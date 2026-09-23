export interface QueueJobHandler<TPayload> {
  (payload: TPayload): Promise<void>;
}

/**
 * Abstração mínima sobre uma fila de jobs. `InMemoryQueueAdapter` implementa
 * isso sem infraestrutura externa; `BullMqQueueAdapter` implementa o mesmo
 * contrato sobre Redis real via BullMQ. Nenhum código de aplicação deve
 * depender diretamente de BullMQ ou de estruturas em memória.
 */
export interface QueueAdapter {
  enqueue<TPayload>(queueName: string, payload: TPayload): Promise<void>;
  registerHandler<TPayload>(queueName: string, handler: QueueJobHandler<TPayload>): void;
  close(): Promise<void>;
}

export const QUEUE_ADAPTER = Symbol('QUEUE_ADAPTER');
