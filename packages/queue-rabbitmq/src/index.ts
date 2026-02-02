import { Cloudflare, ErrorFactory, generateUuid } from '@zintrust/core';

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
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  vhost?: string;
  httpGatewayUrl?: string;
  httpGatewayToken?: string;
  httpGatewayTimeoutMs?: number;
};

type RabbitMqDriverState = {
  connection?: AmqplibConnection;
  channel?: AmqplibChannel;
  inFlight: Map<string, AmqplibMessage>;
};

/**
 * Helper to resolve configuration value from config object or environment
 */
const getConfigValue = (
  config: RabbitMqQueueConfig | undefined,
  configKey: keyof RabbitMqQueueConfig,
  envKey: string,
  defaultValue: string
): string => {
  return (config?.[configKey] ?? process.env[envKey] ?? defaultValue).toString().trim();
};

/**
 * Build AMQP URL from components
 */
const buildAmqpUrl = (
  host: string,
  port: number,
  username: string,
  password: string,
  vhost: string
): string => {
  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  const vhostSegment = vhost === '/' ? '/' : `/${encodeURIComponent(vhost)}`;
  const resolvedPort = Number.isFinite(port) ? port : 5672;
  return `amqp://${auth}@${host}:${resolvedPort}${vhostSegment}`;
};

function resolveUrl(config?: RabbitMqQueueConfig): string {
  const url = getConfigValue(config, 'url', 'RABBITMQ_URL', '');
  if (url !== '') return url;

  const host = getConfigValue(config, 'host', 'RABBITMQ_HOST', '');
  if (host === '') {
    throw ErrorFactory.createConfigError('RabbitMQ queue driver requires RABBITMQ_URL or host');
  }

  const port = Number(getConfigValue(config, 'port', 'RABBITMQ_PORT', '5672'));
  const username = getConfigValue(config, 'username', 'RABBITMQ_USER', 'guest');
  const password = getConfigValue(config, 'password', 'RABBITMQ_PASSWORD', 'guest');
  const vhost = getConfigValue(config, 'vhost', 'RABBITMQ_VHOST', '/');

  return buildAmqpUrl(host, port, username, password, vhost);
}

const resolveGatewayUrl = (config?: RabbitMqQueueConfig): string => {
  return getConfigValue(config, 'httpGatewayUrl', 'RABBITMQ_HTTP_GATEWAY_URL', '');
};

const resolveGatewayToken = (config?: RabbitMqQueueConfig): string | null => {
  const token = getConfigValue(config, 'httpGatewayToken', 'RABBITMQ_HTTP_GATEWAY_TOKEN', '');
  return token === '' ? null : token;
};

const resolveGatewayTimeoutMs = (config?: RabbitMqQueueConfig): number => {
  const raw = config?.httpGatewayTimeoutMs ?? process.env['RABBITMQ_HTTP_GATEWAY_TIMEOUT_MS'];
  const parsed = Number(raw ?? 15000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
};

const shouldUseGateway = (config?: RabbitMqQueueConfig): boolean => {
  const gatewayUrl = resolveGatewayUrl(config);
  if (gatewayUrl !== '') return true;
  return Cloudflare.getWorkersEnv() !== null;
};

const buildGatewayHeaders = (config?: RabbitMqQueueConfig): Record<string, string> => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  const token = resolveGatewayToken(config);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
};

const fetchGateway = async <T>(
  config: RabbitMqQueueConfig | undefined,
  path: string,
  body?: Record<string, unknown>
): Promise<T> => {
  const base = resolveGatewayUrl(config);
  if (base === '') {
    throw ErrorFactory.createConfigError(
      'RabbitMQ HTTP gateway requires RABBITMQ_HTTP_GATEWAY_URL'
    );
  }

  const timeoutMs = resolveGatewayTimeoutMs(config);
  const hasAbortController = typeof AbortController === 'function';
  const controller = hasAbortController ? new AbortController() : undefined;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: buildGatewayHeaders(config),
      body: JSON.stringify(body ?? {}),
      signal: controller?.signal,
    });

    // Clear timeout on successful fetch
    if (timeoutId !== undefined) clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      throw ErrorFactory.createConnectionError(`RabbitMQ gateway error (${res.status})`, {
        status: res.status,
        body: text,
      });
    }

    return (await res.json()) as T;
  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    throw error;
  } finally {
    // Final cleanup safeguard
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

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
  if (shouldUseGateway(config)) {
    return createRabbitMqHttpGatewayDriver(config);
  }

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

function createRabbitMqHttpGatewayDriver(config?: RabbitMqQueueConfig): {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
} {
  return {
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      const response = await fetchGateway<{ id?: string }>(config, '/enqueue', {
        queue,
        payload,
      });
      return typeof response?.id === 'string' && response.id.trim() !== ''
        ? response.id
        : generateUuid();
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      const response = await fetchGateway<{ message?: QueueMessage<T> | null }>(
        config,
        '/dequeue',
        { queue }
      );
      const msg = response?.message ?? null;
      if (msg === null || msg === undefined) return undefined;
      return msg;
    },

    async ack(queue: string, id: string): Promise<void> {
      await fetchGateway(config, '/ack', { queue, id });
    },

    async length(queue: string): Promise<number> {
      const response = await fetchGateway<{ length?: number }>(config, '/length', { queue });
      const length = Number(response?.length ?? 0);
      return Number.isFinite(length) ? length : 0;
    },

    async drain(queue: string): Promise<void> {
      await fetchGateway(config, '/drain', { queue });
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
