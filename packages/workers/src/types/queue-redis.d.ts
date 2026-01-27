declare module '@zintrust/queue-redis' {
  export type QueueMessage<T = unknown> = {
    id: string;
    payload: T;
    attempts: number;
  };

  export type RedisPublishClient = {
    connect?: () => Promise<void>;
    publish(channel: string, message: string): Promise<number>;
  };

  export const RedisQueue: {
    enqueue: <T = unknown>(queue: string, payload: T) => Promise<string>;
    dequeue: <T = unknown>(queue: string) => Promise<QueueMessage<T> | undefined>;
    ack: (queue: string, id: string) => Promise<void>;
    length: (queue: string) => Promise<number>;
    drain: (queue: string) => Promise<void>;
  };

  export const BullMQRedisQueue: {
    getQueue: (queueName: string) => unknown;
    enqueue: <T = unknown>(queue: string, payload: T) => Promise<string>;
    dequeue: <T = unknown>(queue: string) => Promise<QueueMessage<T> | undefined>;
    ack: (queue: string, id: string) => Promise<void>;
    length: (queue: string) => Promise<number>;
    drain: (queue: string) => Promise<void>;
    shutdown: () => Promise<void>;
    closeQueue: (queueName: string) => Promise<void>;
    getQueueNames: () => string[];
  };

  export const createRedisPublishClient: () => Promise<RedisPublishClient>;
  export const resetPublishClient: () => void;

  export const _ZINTRUST_QUEUE_REDIS_VERSION: string;
  export const _ZINTRUST_QUEUE_REDIS_BUILD_DATE: string;
}
