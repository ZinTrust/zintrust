import { ErrorFactory, generateUuid } from '@zintrust/core';

export type QueueMessage<T = unknown> = { id: string; payload: T; attempts: number };

type AmqplibConnection = {
  createChannel: () => Promise<AmqplibChannel>;
  close?: () => Promise<void>;
};

type AmqplibChannel = {
  assertQueue: (queue: string, opts?: unknown) => Promise<unknown>;
  sendToQueue: (queue: string, content: Buffer, opts?: unknown) => boolean;
  get: (queue: string, opts?: unknown) => Promise<AmqplibMessage | false>;
  ack: (msg: AmqplibMessage) => void;
  checkQueue?: (queue: string) => Promise<{ messageCount: number }>;
  purgeQueue?: (queue: string) => Promise<unknown>;
  close?: () => Promise<void>;
};

type AmqplibMessage = {
  content: Buffer;
};

async function importAmqplib(): Promise<{ connect: (url: string) => Promise<AmqplibConnection> }> {
  // Avoid a string-literal import so TypeScript doesn't require the module at build time.
  const specifier = 'amqplib';
  return (await import(specifier)) as unknown as {
    connect: (url: string) => Promise<AmqplibConnection>;
  };
}

export type RabbitMqQueueConfig = {
  driver: 'rabbitmq';
  url?: string;
};

type RabbitMqDriverState = {
  connection?: AmqplibConnection;
  channel?: AmqplibChannel;
  inFlight: Map<string, AmqplibMessage>;
};

function resolveUrl(config?: RabbitMqQueueConfig): string {
  const url = (config?.url ?? process.env['RABBITMQ_URL'] ?? '').toString().trim();
  if (url === '') {
    throw ErrorFactory.createConfigError('RabbitMQ queue driver requires RABBITMQ_URL');
  }
  return url;
}

async function ensureChannel(
  state: RabbitMqDriverState,
  config?: RabbitMqQueueConfig
): Promise<AmqplibChannel> {
  if (state.channel !== undefined) return state.channel;

  const { connect } = await importAmqplib();
  state.connection = await connect(resolveUrl(config));
  state.channel = await state.connection.createChannel();
  return state.channel;
}

async function ensureQueue(
  state: RabbitMqDriverState,
  config: RabbitMqQueueConfig | undefined,
  queue: string
): Promise<void> {
  const ch = await ensureChannel(state, config);
  await ch.assertQueue(queue, { durable: true });
}

async function drainFallback(
  state: RabbitMqDriverState,
  config: RabbitMqQueueConfig | undefined,
  queue: string
): Promise<void> {
  const ch = await ensureChannel(state, config);
  const msg = await ch.get(queue, { noAck: false });
  if (msg === false) return;
  ch.ack(msg);
  await drainFallback(state, config, queue);
}

function createRabbitMqQueueDriver(config?: RabbitMqQueueConfig): {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
} {
  const state: RabbitMqDriverState = { inFlight: new Map() };

  return {
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      const id = generateUuid();
      await ensureQueue(state, config, queue);

      const ch = await ensureChannel(state, config);
      const msg = JSON.stringify({ id, payload, attempts: 0 });
      ch.sendToQueue(queue, Buffer.from(msg), { persistent: true });
      return id;
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      await ensureQueue(state, config, queue);
      const ch = await ensureChannel(state, config);
      const msg = await ch.get(queue, { noAck: false });
      if (msg === false) return undefined;

      try {
        const parsed = JSON.parse(msg.content.toString('utf-8')) as QueueMessage<T>;
        if (typeof parsed?.id === 'string' && parsed.id.trim() !== '') {
          state.inFlight.set(parsed.id, msg);
        }
        return parsed;
      } catch (err) {
        // If we can't parse, ack it so we don't get stuck.
        try {
          ch.ack(msg);
        } catch {
          // ignore
        }
        throw ErrorFactory.createTryCatchError('Failed to parse queue message', err as Error);
      }
    },

    async ack(_queue: string, id: string): Promise<void> {
      const ch = await ensureChannel(state, config);
      const msg = state.inFlight.get(id);
      if (msg === undefined) return;
      state.inFlight.delete(id);
      ch.ack(msg);
    },

    async length(queue: string): Promise<number> {
      await ensureQueue(state, config, queue);
      const ch = await ensureChannel(state, config);
      if (typeof ch.checkQueue === 'function') {
        const r = await ch.checkQueue(queue);
        return Number(r.messageCount ?? 0);
      }
      return 0;
    },

    async drain(queue: string): Promise<void> {
      await ensureQueue(state, config, queue);
      const ch = await ensureChannel(state, config);
      if (typeof ch.purgeQueue === 'function') {
        await ch.purgeQueue(queue);
        return;
      }

      await drainFallback(state, config, queue);
    },
  };
}

export const RabbitMqQueue = Object.freeze({
  create(config?: RabbitMqQueueConfig): {
    enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
    dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
    ack(queue: string, id: string): Promise<void>;
    length(queue: string): Promise<number>;
    drain(queue: string): Promise<void>;
  } {
    return createRabbitMqQueueDriver(config);
  },
});

export default RabbitMqQueue;

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_QUEUE_RABBITMQ_VERSION = '0.1.15';
export const _ZINTRUST_QUEUE_RABBITMQ_BUILD_DATE = '__BUILD_DATE__';
