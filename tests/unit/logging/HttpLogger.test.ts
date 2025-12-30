import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

function createFetchResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map<string, string>(),
    text: async () => body,
  } as any;
}

describe('HttpLogger', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    process.env['HTTP_LOG_ENABLED'] = 'true';
    process.env['HTTP_LOG_ENDPOINT_URL'] = 'https://logs.test/ingest';
    process.env['HTTP_LOG_BATCH_SIZE'] = '2';
    process.env['HTTP_LOG_AUTH_TOKEN'] = 'secret';

    globalThis.fetch = vi.fn(async () => createFetchResponse(200, 'ok')) as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;

    delete process.env['HTTP_LOG_ENABLED'];
    delete process.env['HTTP_LOG_ENDPOINT_URL'];
    delete process.env['HTTP_LOG_BATCH_SIZE'];
    delete process.env['HTTP_LOG_AUTH_TOKEN'];
  });

  it('batches events up to HTTP_LOG_BATCH_SIZE and sends once', async () => {
    const { HttpLogger } = await import('@/config/logging/HttpLogger');

    HttpLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'one',
    });

    HttpLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'two',
    });

    await vi.runAllTimersAsync();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    expect(url).toBe('https://logs.test/ingest');
    expect(init.headers.Authorization).toBe('Bearer secret');

    const body = JSON.parse(String(init.body)) as any;
    expect(body.count).toBe(2);
    expect(body.events.map((e: any) => e.message)).toEqual(['one', 'two']);
  });

  it('retries transient failures up to 3 times', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('network');
      return createFetchResponse(200, 'ok');
    }) as any;

    const { HttpLogger } = await import('@/config/logging/HttpLogger');

    HttpLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'retry me',
    });

    await vi.runAllTimersAsync();

    // backoff timers are 100ms, 200ms, ...
    await vi.advanceTimersByTimeAsync(1000);

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
