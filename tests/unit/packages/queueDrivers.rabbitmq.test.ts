import { describe, expect, it, vi } from 'vitest';

describe('adapter package queue-rabbitmq', () => {
  it('enqueue/dequeue/ack/length/drain use mocked amqplib', async () => {
    vi.resetModules();

    const calls: Record<string, number> = {
      assertQueue: 0,
      sendToQueue: 0,
      get: 0,
      ack: 0,
      checkQueue: 0,
      purgeQueue: 0,
    };

    const channel = {
      assertQueue: async (_queue: string) => {
        calls.assertQueue += 1;
      },
      sendToQueue: (_queue: string, _content: Buffer) => {
        calls.sendToQueue += 1;
        return true;
      },
      get: async (_queue: string) => {
        calls.get += 1;
        return {
          content: Buffer.from(JSON.stringify({ id: 'r1', payload: { ok: true }, attempts: 0 })),
        };
      },
      ack: (_msg: unknown) => {
        calls.ack += 1;
      },
      checkQueue: async (_queue: string) => {
        calls.checkQueue += 1;
        return { messageCount: 3 };
      },
      purgeQueue: async (_queue: string) => {
        calls.purgeQueue += 1;
      },
    };

    vi.doMock('amqplib', () => {
      return {
        connect: async (_url: string) => {
          return {
            createChannel: async () => channel,
          };
        },
      };
    });

    const { RabbitMqQueue } = (await import('../../../packages/queue-rabbitmq/src/index.js')) as {
      RabbitMqQueue: {
        create: (config?: unknown) => {
          enqueue: (queue: string, payload: unknown) => Promise<string>;
          dequeue: (queue: string) => Promise<{ id: string } | undefined>;
          ack: (queue: string, id: string) => Promise<void>;
          length: (queue: string) => Promise<number>;
          drain: (queue: string) => Promise<void>;
        };
      };
    };

    const driver = RabbitMqQueue.create({ driver: 'rabbitmq', url: 'amqp://example.test' });
    await driver.enqueue('q', { hello: 'world' });
    const msg = await driver.dequeue('q');
    expect(msg?.id).toBe('r1');
    await driver.ack('q', 'r1');
    expect(await driver.length('q')).toBe(3);
    await driver.drain('q');

    expect(calls.assertQueue).toBeGreaterThan(0);
    expect(calls.sendToQueue).toBe(1);
    expect(calls.get).toBe(1);
    expect(calls.ack).toBeGreaterThan(0);
    expect(calls.checkQueue).toBe(1);
    expect(calls.purgeQueue).toBe(1);
  });
});
