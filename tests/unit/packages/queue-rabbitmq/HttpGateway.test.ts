import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestInfo } from 'miniflare';
import { RabbitMqQueue } from '../../../../packages/queue-rabbitmq/src/index';

type FetchCall = { url: string; init?: RequestInit };

describe('RabbitMQ HTTP gateway (Workers)', () => {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });

      if (url.endsWith('/enqueue')) {
        return new Response(JSON.stringify({ id: 'msg-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/dequeue')) {
        return new Response(
          JSON.stringify({ message: { id: 'msg-1', payload: { ok: true }, attempts: 0 } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      }

      if (url.endsWith('/length')) {
        return new Response(JSON.stringify({ length: 3 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('routes queue operations through gateway endpoints', async () => {
    const queue = RabbitMqQueue.create({
      driver: 'rabbitmq',
      httpGatewayUrl: 'https://gateway.example.com',
      httpGatewayToken: 'token-123',
    });

    const id = await queue.enqueue('jobs', { ok: true });
    expect(id).toBe('msg-1');

    const message = await queue.dequeue<{ ok: boolean }>('jobs');
    expect(message).toEqual({ id: 'msg-1', payload: { ok: true }, attempts: 0 });

    await queue.ack('jobs', 'msg-1');
    expect(await queue.length('jobs')).toBe(3);
    await queue.drain('jobs');

    const authHeader = calls[0]?.init?.headers as Record<string, string> | undefined;
    expect(authHeader?.['authorization']).toBe('Bearer token-123');
  });
});
