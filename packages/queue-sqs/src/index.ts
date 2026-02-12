import { ErrorFactory, Logger, generateUuid } from '@zintrust/core';

export type QueueMessage<T = unknown> = { id: string; payload: T; attempts: number };

type SqsClient = {
  send: (command: unknown) => Promise<unknown>;
};

type SqsModule = {
  SQSClient: new (opts: Record<string, unknown>) => SqsClient;
  SendMessageCommand: new (input: Record<string, unknown>) => unknown;
  ReceiveMessageCommand: new (input: Record<string, unknown>) => unknown;
  DeleteMessageCommand: new (input: Record<string, unknown>) => unknown;
  GetQueueAttributesCommand: new (input: Record<string, unknown>) => unknown;
  PurgeQueueCommand: new (input: Record<string, unknown>) => unknown;
};

async function importSqs(): Promise<SqsModule> {
  // Avoid a string-literal import so TypeScript doesn't require the module at build time.
  const specifier = '@aws-sdk/client-sqs';
  return (await import(specifier)) as unknown as SqsModule;
}

export type SqsQueueConfig = {
  driver: 'sqs';
  region?: string;
  queueUrl?: string;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
};

type SqsState = {
  receipts: Map<string, { receipt: string; seenAt: number }>;
  client?: SqsClient;
  mod?: SqsModule;
};

const RECEIPTS_MAX_ENTRIES = 10000;
const RECEIPTS_TTL_MS = 15 * 60 * 1000;

const pruneReceipts = (state: SqsState): void => {
  const now = Date.now();

  for (const [id, value] of state.receipts.entries()) {
    if (now - value.seenAt > RECEIPTS_TTL_MS) {
      state.receipts.delete(id);
    }
  }

  if (state.receipts.size <= RECEIPTS_MAX_ENTRIES) return;

  const overflow = state.receipts.size - RECEIPTS_MAX_ENTRIES;
  let removed = 0;
  for (const id of state.receipts.keys()) {
    state.receipts.delete(id);
    removed++;
    if (removed >= overflow) break;
  }

  Logger.warn('SQS receipts map exceeded max entries; pruned oldest items', {
    removed,
    sizeAfter: state.receipts.size,
  });
};

function resolveRegion(config?: SqsQueueConfig): string {
  const region = (config?.region ?? process.env['AWS_REGION'] ?? '').toString().trim();
  if (region === '') throw ErrorFactory.createConfigError('SQS: missing AWS_REGION');
  return region;
}

function resolveQueueUrl(config?: SqsQueueConfig): string {
  const queueUrl = (config?.queueUrl ?? process.env['SQS_QUEUE_URL'] ?? '').toString().trim();
  if (queueUrl === '') throw ErrorFactory.createConfigError('SQS: missing SQS_QUEUE_URL');
  return queueUrl;
}

async function ensure(
  state: SqsState,
  config?: SqsQueueConfig
): Promise<{ client: SqsClient; mod: SqsModule }> {
  if (state.client !== undefined && state.mod !== undefined)
    return { client: state.client, mod: state.mod };
  state.mod = await importSqs();
  state.client = new state.mod.SQSClient({ region: resolveRegion(config) });
  return { client: state.client, mod: state.mod };
}

function resolveUrl(_queue: string, config?: SqsQueueConfig): string {
  return resolveQueueUrl(config);
}

type SqsQueueDriver = {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
};

const createEnqueue =
  (state: SqsState, config?: SqsQueueConfig) =>
  async <T = unknown>(queue: string, payload: T): Promise<string> => {
    const id = generateUuid();
    const { client, mod } = await ensure(state, config);
    const body = JSON.stringify({ id, payload, attempts: 0 });

    await client.send(
      new mod.SendMessageCommand({
        QueueUrl: resolveUrl(queue, config),
        MessageBody: body,
      })
    );

    return id;
  };

const createDequeue =
  (
    state: SqsState,
    waitTimeSeconds: number,
    visibilityTimeout: number | undefined,
    config?: SqsQueueConfig
  ) =>
  async <T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> => {
    pruneReceipts(state);
    const { client, mod } = await ensure(state, config);

    const resp = (await client.send(
      new mod.ReceiveMessageCommand({
        QueueUrl: resolveUrl(queue, config),
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: waitTimeSeconds,
        VisibilityTimeout: visibilityTimeout,
      })
    )) as {
      Messages?: Array<{ Body?: string; ReceiptHandle?: string }>;
    };

    const msg = resp.Messages?.[0];
    if (msg?.Body === undefined) return undefined;

    try {
      const parsed = JSON.parse(msg.Body) as QueueMessage<T>;
      if (msg.ReceiptHandle && typeof parsed?.id === 'string' && parsed.id.trim() !== '') {
        state.receipts.set(parsed.id, { receipt: msg.ReceiptHandle, seenAt: Date.now() });
      }
      return parsed;
    } catch (err) {
      throw ErrorFactory.createTryCatchError('Failed to parse queue message', err as Error);
    }
  };

const createAck =
  (state: SqsState, config?: SqsQueueConfig) =>
  async (queue: string, id: string): Promise<void> => {
    pruneReceipts(state);
    const receiptEntry = state.receipts.get(id);
    if (receiptEntry === undefined) return;
    state.receipts.delete(id);

    const { client, mod } = await ensure(state, config);
    await client.send(
      new mod.DeleteMessageCommand({
        QueueUrl: resolveUrl(queue, config),
        ReceiptHandle: receiptEntry.receipt,
      })
    );
  };

const createLength =
  (state: SqsState, config?: SqsQueueConfig) =>
  async (queue: string): Promise<number> => {
    const { client, mod } = await ensure(state, config);
    const resp = (await client.send(
      new mod.GetQueueAttributesCommand({
        QueueUrl: resolveUrl(queue, config),
        AttributeNames: ['ApproximateNumberOfMessages'],
      })
    )) as {
      Attributes?: Record<string, string>;
    };

    const raw = resp.Attributes?.['ApproximateNumberOfMessages'] ?? '0';
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

const createDrain =
  (state: SqsState, config?: SqsQueueConfig) =>
  async (queue: string): Promise<void> => {
    const { client, mod } = await ensure(state, config);
    await client.send(new mod.PurgeQueueCommand({ QueueUrl: resolveUrl(queue, config) }));
  };

function createSqsQueueDriver(config?: SqsQueueConfig): {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
} {
  const waitTimeSeconds = config?.waitTimeSeconds ?? 0;
  const visibilityTimeout = config?.visibilityTimeout;
  const state: SqsState = { receipts: new Map() };

  const driver: SqsQueueDriver = {
    enqueue: createEnqueue(state, config),
    dequeue: createDequeue(state, waitTimeSeconds, visibilityTimeout, config),
    ack: createAck(state, config),
    length: createLength(state, config),
    drain: createDrain(state, config),
  };

  return driver;
}

export const SqsQueue = Object.freeze({
  create(config?: SqsQueueConfig): {
    enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
    dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
    ack(queue: string, id: string): Promise<void>;
    length(queue: string): Promise<number>;
    drain(queue: string): Promise<void>;
  } {
    return createSqsQueueDriver(config);
  },
});

export default SqsQueue;

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_QUEUE_SQS_VERSION = '0.1.15';
export const _ZINTRUST_QUEUE_SQS_BUILD_DATE = '__BUILD_DATE__';
