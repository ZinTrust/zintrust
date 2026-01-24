import { describe, expect, it, vi } from 'vitest';

describe('adapter package queue-sqs', () => {
  it('enqueue/dequeue/ack/length/drain work with mocked aws sdk', async () => {
    vi.resetModules();

    const sent: Array<{ kind: string; input: Record<string, unknown> }> = [];

    class FakeSqsClient {
      async send(command: unknown): Promise<unknown> {
        const cmd = command as { __kind?: string; input?: Record<string, unknown> };
        const kind = String(cmd.__kind ?? 'unknown');
        sent.push({ kind, input: cmd.input ?? {} });

        if (kind === 'ReceiveMessageCommand') {
          return {
            Messages: [
              {
                Body: JSON.stringify({ id: 'm1', payload: { ok: true }, attempts: 0 }),
                ReceiptHandle: 'rh-1',
              },
            ],
          };
        }

        if (kind === 'GetQueueAttributesCommand') {
          return { Attributes: { ApproximateNumberOfMessages: '7' } };
        }

        return {};
      }
    }

    vi.doMock('@aws-sdk/client-sqs', () => {
      return {
        SQSClient: class {
          client = new FakeSqsClient();
          send = this.client.send.bind(this.client);
        },
        SendMessageCommand: class {
          __kind = 'SendMessageCommand';
          constructor(public input: Record<string, unknown>) {}
        },
        ReceiveMessageCommand: class {
          __kind = 'ReceiveMessageCommand';
          constructor(public input: Record<string, unknown>) {}
        },
        DeleteMessageCommand: class {
          __kind = 'DeleteMessageCommand';
          constructor(public input: Record<string, unknown>) {}
        },
        GetQueueAttributesCommand: class {
          __kind = 'GetQueueAttributesCommand';
          constructor(public input: Record<string, unknown>) {}
        },
        PurgeQueueCommand: class {
          __kind = 'PurgeQueueCommand';
          constructor(public input: Record<string, unknown>) {}
        },
      };
    });

    const { SqsQueue } = (await import('../../../packages/queue-redis/queue-sqs/src/index.js')) as {
      SqsQueue: {
        create: (config?: unknown) => {
          enqueue: (queue: string, payload: unknown) => Promise<string>;
          dequeue: (queue: string) => Promise<{ id: string } | undefined>;
          ack: (queue: string, id: string) => Promise<void>;
          length: (queue: string) => Promise<number>;
          drain: (queue: string) => Promise<void>;
        };
      };
    };

    const driver = SqsQueue.create({
      driver: 'sqs',
      region: 'us-east-1',
      queueUrl: 'https://example.test/queue',
      waitTimeSeconds: 0,
      visibilityTimeout: 10,
    });

    const enqueueId = await driver.enqueue('q', { hello: 'world' });
    expect(typeof enqueueId).toBe('string');
    expect(enqueueId.trim()).not.toBe('');

    const msg = await driver.dequeue('q');
    expect(msg?.id).toBe('m1');

    await driver.ack('q', 'm1');
    expect(sent.some((s) => s.kind === 'DeleteMessageCommand')).toBe(true);

    expect(await driver.length('q')).toBe(7);
    await driver.drain('q');
    expect(sent.some((s) => s.kind === 'PurgeQueueCommand')).toBe(true);
  });
});
