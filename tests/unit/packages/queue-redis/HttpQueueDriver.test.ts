import { describe, expect, it, vi } from 'vitest';

import { Env } from '@/config/env';
import { JobStateTracker } from '@/tools/queue/JobStateTracker';
import type { RequestInfo } from 'miniflare';
import { HttpQueueDriver } from '../../../../packages/queue-redis/src/HttpQueueDriver';

describe('HttpQueueDriver', () => {
  it('sends signed enqueue request and returns gateway job id', async () => {
    const originalFetch = globalThis.fetch;

    try {
      Env.setSource({
        QUEUE_HTTP_PROXY_URL: 'http://127.0.0.1:7772',
        QUEUE_HTTP_PROXY_PATH: '/api/_sys/queue/rpc',
        QUEUE_HTTP_PROXY_KEY_ID: 'test-key',
        QUEUE_HTTP_PROXY_KEY: 'test-secret',
        QUEUE_HTTP_PROXY_TIMEOUT_MS: '1000',
      });

      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('x-zt-key-id')).toBe('test-key');
        expect(headers.get('x-zt-signature')).toMatch(/^[a-f0-9]{64}$/);

        const bodyText = String(init?.body ?? '{}');
        const body = JSON.parse(bodyText) as {
          action: string;
          payload: { queue?: string; payload?: Record<string, unknown> };
        };

        expect(body.action).toBe('enqueue');
        expect(body.payload.queue).toBe('emails');

        return new Response(
          JSON.stringify({ ok: true, requestId: 'req-1', result: 'job-123', error: null }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      });

      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const jobId = await HttpQueueDriver.enqueue('emails', {
        payload: { hello: 'world' },
      } as any);

      expect(jobId).toBe('job-123');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      Env.setSource(null);
      globalThis.fetch = originalFetch;
    }
  });

  it('throws typed error when gateway responds non-ok', async () => {
    const originalFetch = globalThis.fetch;

    try {
      Env.setSource({
        QUEUE_HTTP_PROXY_URL: 'http://127.0.0.1:7772',
        QUEUE_HTTP_PROXY_PATH: '/api/_sys/queue/rpc',
        QUEUE_HTTP_PROXY_KEY_ID: 'test-key',
        QUEUE_HTTP_PROXY_KEY: 'test-secret',
        QUEUE_HTTP_PROXY_TIMEOUT_MS: '1000',
      });

      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: false,
            requestId: 'req-2',
            result: null,
            error: { code: 'QUEUE_ERROR', message: 'boom' },
          }),
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }
        );
      }) as unknown as typeof fetch;

      await expect(HttpQueueDriver.length('emails')).rejects.toMatchObject({
        details: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('boom'),
          }),
        }),
      });
    } finally {
      Env.setSource(null);
      globalThis.fetch = originalFetch;
    }
  });

  it('returns fallback job id and marks pending recovery when enqueue gateway fails', async () => {
    const originalFetch = globalThis.fetch;

    try {
      JobStateTracker.reset();
      Env.setSource({
        QUEUE_HTTP_PROXY_URL: 'http://127.0.0.1:7772',
        QUEUE_HTTP_PROXY_PATH: '/api/_sys/queue/rpc',
        QUEUE_HTTP_PROXY_KEY_ID: 'test-key',
        QUEUE_HTTP_PROXY_KEY: 'test-secret',
        QUEUE_HTTP_PROXY_TIMEOUT_MS: '5',
        QUEUE_HTTP_PROXY_RETRY_MAX: '0',
      });

      globalThis.fetch = vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;

      const jobId = await HttpQueueDriver.enqueue('emails', {
        uniqueId: 'idempotent-job-1',
        payload: { hello: 'world' },
      } as any);

      expect(jobId).toBe('idempotent-job-1');
      expect(JobStateTracker.get('emails', 'idempotent-job-1')?.status).toBe('pending_recovery');
    } finally {
      Env.setSource(null);
      globalThis.fetch = originalFetch;
    }
  });
});
