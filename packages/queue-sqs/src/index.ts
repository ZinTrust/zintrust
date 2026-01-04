import { ErrorFactory, generateUuid } from '@zintrust/core';

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

export const SqsQueue = Object.freeze({
  create(config?: SqsQueueConfig): {
    enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
    dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
    ack(queue: string, id: string): Promise<void>;
    length(queue: string): Promise<number>;
    drain(queue: string): Promise<void>;
  } {
    const waitTimeSeconds = config?.waitTimeSeconds ?? 0;
    const visibilityTimeout = config?.visibilityTimeout;
    const receipts = new Map<string, string>();

    let client: SqsClient | undefined;
    let mod: SqsModule | undefined;

    const resolveRegion = (): string => {
      const region = (config?.region ?? process.env['AWS_REGION'] ?? '').toString().trim();
      if (region === '') throw ErrorFactory.createConfigError('SQS: missing AWS_REGION');
      return region;
    };

    const resolveQueueUrl = (): string => {
      const queueUrl = (config?.queueUrl ?? process.env['SQS_QUEUE_URL'] ?? '').toString().trim();
      if (queueUrl === '') throw ErrorFactory.createConfigError('SQS: missing SQS_QUEUE_URL');
      return queueUrl;
    };

    const ensure = async (): Promise<{ client: SqsClient; mod: SqsModule }> => {
      if (client !== undefined && mod !== undefined) return { client, mod };
      mod = await importSqs();
      client = new mod.SQSClient({ region: resolveRegion() });
      return { client, mod };
    };

    const resolveUrl = (queue: string): string => {
      void queue;
      return resolveQueueUrl();
    };

    return {
      async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
        const id = generateUuid();
        const { client, mod } = await ensure();

        const body = JSON.stringify({ id, payload, attempts: 0 });
        await client.send(
          new mod.SendMessageCommand({
            QueueUrl: resolveUrl(queue),
            MessageBody: body,
          })
        );

        return id;
      },

      async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
        const { client, mod } = await ensure();

        const resp = (await client.send(
          new mod.ReceiveMessageCommand({
            QueueUrl: resolveUrl(queue),
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
            receipts.set(parsed.id, msg.ReceiptHandle);
          }
          return parsed;
        } catch (err) {
          throw ErrorFactory.createTryCatchError('Failed to parse queue message', err as Error);
        }
      },

      async ack(queue: string, id: string): Promise<void> {
        const receipt = receipts.get(id);
        if (receipt === undefined) return;
        receipts.delete(id);

        const { client, mod } = await ensure();
        await client.send(
          new mod.DeleteMessageCommand({
            QueueUrl: resolveUrl(queue),
            ReceiptHandle: receipt,
          })
        );
      },

      async length(queue: string): Promise<number> {
        const { client, mod } = await ensure();
        const resp = (await client.send(
          new mod.GetQueueAttributesCommand({
            QueueUrl: resolveUrl(queue),
            AttributeNames: ['ApproximateNumberOfMessages'],
          })
        )) as {
          Attributes?: Record<string, string>;
        };

        const raw = resp.Attributes?.['ApproximateNumberOfMessages'] ?? '0';
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
      },

      async drain(queue: string): Promise<void> {
        const { client, mod } = await ensure();
        await client.send(new mod.PurgeQueueCommand({ QueueUrl: resolveUrl(queue) }));
      },
    };
  },
});

export default SqsQueue;
