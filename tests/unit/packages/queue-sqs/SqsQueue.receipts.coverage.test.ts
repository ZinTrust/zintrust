import { describe, expect, it, vi } from 'vitest';

describe('packages/queue-sqs SqsQueue receipts (coverage)', () => {
  it('stores receipt handle on dequeue and uses it on ack', async () => {
    const sendSpy = vi.fn(async (cmd: unknown) => {
      // Return a single message for ReceiveMessageCommand.
      if ((cmd as any)?.__type === 'ReceiveMessageCommand') {
        return {
          Messages: [
            {
              Body: JSON.stringify({ id: 'abc', payload: { ok: true }, attempts: 0 }),
              ReceiptHandle: 'rh-123',
            },
          ],
        };
      }
      return {};
    });

    vi.doMock('@aws-sdk/client-sqs', () => {
      class SQSClient {
        public send(command: unknown): Promise<unknown> {
          return sendSpy(command);
        }
      }

      class ReceiveMessageCommand {
        public __type = 'ReceiveMessageCommand' as const;
        public input: Record<string, unknown>;
        public constructor(input: Record<string, unknown>) {
          this.input = input;
        }
      }

      class DeleteMessageCommand {
        public __type = 'DeleteMessageCommand' as const;
        public input: Record<string, unknown>;
        public constructor(input: Record<string, unknown>) {
          this.input = input;
        }
      }

      class SendMessageCommand {
        public __type = 'SendMessageCommand' as const;
        public input: Record<string, unknown>;
        public constructor(input: Record<string, unknown>) {
          this.input = input;
        }
      }

      class GetQueueAttributesCommand {
        public __type = 'GetQueueAttributesCommand' as const;
        public input: Record<string, unknown>;
        public constructor(input: Record<string, unknown>) {
          this.input = input;
        }
      }

      class PurgeQueueCommand {
        public __type = 'PurgeQueueCommand' as const;
        public input: Record<string, unknown>;
        public constructor(input: Record<string, unknown>) {
          this.input = input;
        }
      }

      return {
        SQSClient,
        ReceiveMessageCommand,
        DeleteMessageCommand,
        SendMessageCommand,
        GetQueueAttributesCommand,
        PurgeQueueCommand,
      };
    });

    const { SqsQueue } = await import('../../../../packages/queue-sqs/src/index');

    const queue = SqsQueue.create({
      driver: 'sqs',
      region: 'us-east-1',
      queueUrl: 'https://example.com/queue',
      waitTimeSeconds: 0,
    });

    const msg = await queue.dequeue('q');
    expect(msg).toEqual({ id: 'abc', payload: { ok: true }, attempts: 0 });

    // If the receipt handle was stored, ack() will send a DeleteMessageCommand.
    await queue.ack('q', 'abc');

    expect(sendSpy).toHaveBeenCalled();
    expect(
      sendSpy.mock.calls.some(([cmd]) => (cmd as any)?.__type === 'DeleteMessageCommand')
    ).toBe(true);
  });
});
