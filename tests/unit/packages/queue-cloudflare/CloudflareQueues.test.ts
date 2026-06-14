import { describe, expect, it, vi } from 'vitest';

describe('adapter package queue-cloudflare', () => {
  it('enqueues through a Cloudflare Queue binding when available', async () => {
    vi.resetModules();

    const sent: Array<{ body: unknown; options: unknown }> = [];
    const { CloudflareQueues } = await import(
      '../../../../packages/queue-cloudflare/src/index.js'
    );

    const driver = CloudflareQueues.create({
      driver: 'cloudflare',
      bindingName: 'EMAIL_QUEUE',
      bindings: {
        EMAIL_QUEUE: {
          send: async (body: unknown, options: unknown) => {
            sent.push({ body, options });
          },
        },
      },
      contentType: 'json',
      delaySeconds: 30,
    });

    const id = await driver.enqueue('email-queue', { to: 'user@example.com' });

    expect(id.trim()).not.toBe('');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toMatchObject({
      id,
      payload: { to: 'user@example.com' },
      attempts: 0,
    });
    expect(sent[0]?.options).toEqual({ contentType: 'json', delaySeconds: 30 });
  });

  it('uses Cloudflare Queues REST API for enqueue/dequeue/ack/length/drain', async () => {
    vi.resetModules();

    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      const rawBody = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url: path, method: init?.method ?? 'GET', body: rawBody });

      if (path.endsWith('/messages/pull')) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              message_backlog_count: 6,
              messages: [
                {
                  id: 'cf-message-id',
                  attempts: 2,
                  body: { id: 'job-1', payload: { ok: true }, attempts: 1 },
                  lease_id: 'lease-1',
                },
              ],
            },
          }),
          { status: 200 }
        );
      }

      if (path.endsWith('/metrics')) {
        return new Response(
          JSON.stringify({
            success: true,
            result: { metadata: { metrics: { backlog_count: 4 } } },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { CloudflareQueues } = await import(
      '../../../../packages/queue-cloudflare/src/index.js'
    );

    const driver = CloudflareQueues.create({
      driver: 'cloudflare',
      accountId: 'account-1',
      queueId: 'queue-1',
      apiToken: 'token-1',
      apiBaseUrl: 'https://api.example.test/client/v4',
      batchSize: 1,
      visibilityTimeoutMs: 30000,
    });

    const enqueuedId = await driver.enqueue('ignored-name', { hello: 'world' });
    expect(enqueuedId.trim()).not.toBe('');

    const message = await driver.dequeue('ignored-name');
    expect(message).toEqual({ id: 'job-1', payload: { ok: true }, attempts: 1 });

    await driver.ack('ignored-name', 'job-1');
    expect(await driver.length('ignored-name')).toBe(4);
    await driver.drain('ignored-name');

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.test/client/v4/accounts/account-1/queues/queue-1/messages',
      'https://api.example.test/client/v4/accounts/account-1/queues/queue-1/messages/pull',
      'https://api.example.test/client/v4/accounts/account-1/queues/queue-1/messages/ack',
      'https://api.example.test/client/v4/accounts/account-1/queues/queue-1/metrics',
      'https://api.example.test/client/v4/accounts/account-1/queues/queue-1/purge',
    ]);
    expect(calls[2]?.body).toEqual({ acks: [{ lease_id: 'lease-1' }], retries: [] });
  });
});
