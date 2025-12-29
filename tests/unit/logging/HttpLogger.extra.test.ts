import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TimeoutFn = typeof globalThis.setTimeout;

describe('HttpLogger branches', () => {
  const originalSetTimeout: TimeoutFn | undefined = globalThis.setTimeout;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    delete process.env['HTTP_LOG_ENABLED'];
    delete process.env['HTTP_LOG_ENDPOINT_URL'];
    delete process.env['HTTP_LOG_AUTH_TOKEN'];
    delete process.env['HTTP_LOG_BATCH_SIZE'];

    globalThis.setTimeout = originalSetTimeout as TimeoutFn;
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout as TimeoutFn;
  });

  it('should not post when disabled', async () => {
    process.env['HTTP_LOG_ENABLED'] = 'false';

    const postSpy = vi.fn();
    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: {
        post: postSpy,
      },
    }));

    const { HttpLogger } = await import('@/config/logging/HttpLogger');

    await HttpLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'x',
    });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('retries send up to max retries with backoff', async () => {
    process.env['HTTP_LOG_ENABLED'] = 'true';
    process.env['HTTP_LOG_ENDPOINT_URL'] = 'https://example.com/logs';
    process.env['HTTP_LOG_AUTH_TOKEN'] = 'tok';
    process.env['HTTP_LOG_BATCH_SIZE'] = '1';

    let callCount = 0;
    const sendSpy = vi.fn(async () => {
      callCount += 1;
      if (callCount < 3) throw new Error('fail');
      return undefined;
    });

    const withAuthSpy = vi.fn(() => undefined);

    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: {
        post: (_url: string, _body: unknown) => ({ withAuth: withAuthSpy, send: sendSpy }),
      },
    }));

    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: any, _ms?: number) => {
      setImmediate(cb as any);
      return 1 as any;
    }) as unknown as TimeoutFn;

    try {
      const { HttpLogger } = await import('@/config/logging/HttpLogger');

      await HttpLogger.enqueue({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'retry',
      });

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(withAuthSpy).toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = original;
    }
  });

  it('returns same flush promise for concurrent enqueues', async () => {
    process.env['HTTP_LOG_ENABLED'] = 'true';
    process.env['HTTP_LOG_ENDPOINT_URL'] = 'https://example.com/logs';
    process.env['HTTP_LOG_BATCH_SIZE'] = '10';

    const sendSpy = vi.fn(async () => undefined);
    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: {
        post: () => ({ send: sendSpy }),
      },
    }));

    const scheduled: Array<() => void> = [];
    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: any, _ms?: number) => {
      scheduled.push(cb as any);
      return 123 as any;
    }) as unknown as TimeoutFn;

    try {
      const { HttpLogger } = await import('@/config/logging/HttpLogger');

      const p1 = HttpLogger.enqueue({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'a',
      });
      const p2 = HttpLogger.enqueue({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'b',
      });

      // `enqueue` is `async`, so each call returns a distinct outer Promise.
      // What we actually want is that only one flush is scheduled.
      expect(scheduled).toHaveLength(1);

      for (const cb of scheduled) cb();
      await p1;
      await p2;

      expect(sendSpy).toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = original;
    }
  });

  it('gives up after max retries when send always fails', async () => {
    process.env['HTTP_LOG_ENABLED'] = 'true';
    process.env['HTTP_LOG_ENDPOINT_URL'] = 'https://example.com/logs';
    process.env['HTTP_LOG_BATCH_SIZE'] = '1';

    const sendSpy = vi.fn(async () => {
      throw new Error('always fail');
    });

    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: {
        post: () => ({ send: sendSpy }),
      },
    }));

    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: any, _ms?: number) => {
      setImmediate(cb as any);
      return 1 as any;
    }) as unknown as TimeoutFn;

    try {
      const { HttpLogger } = await import('@/config/logging/HttpLogger');

      await expect(
        HttpLogger.enqueue({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'retry',
        })
      ).resolves.toBeUndefined();

      expect(sendSpy).toHaveBeenCalledTimes(4);
    } finally {
      globalThis.setTimeout = original;
    }
  });

  it('handles empty endpoint by not throwing (postBatch throws)', async () => {
    process.env['HTTP_LOG_ENABLED'] = 'true';
    process.env['HTTP_LOG_ENDPOINT_URL'] = '   ';
    process.env['HTTP_LOG_BATCH_SIZE'] = '1';

    const postSpy = vi.fn();
    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: {
        post: postSpy,
      },
    }));

    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: any, _ms?: number) => {
      setImmediate(cb as any);
      return 1 as any;
    }) as unknown as TimeoutFn;

    try {
      const { HttpLogger } = await import('@/config/logging/HttpLogger');

      await expect(
        HttpLogger.enqueue({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'x',
        })
      ).resolves.toBeUndefined();

      expect(postSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = original;
    }
  });

  it('schedules flush immediately when setTimeout is missing (microtask path)', async () => {
    process.env['HTTP_LOG_ENABLED'] = 'true';
    process.env['HTTP_LOG_ENDPOINT_URL'] = 'https://example.com/logs';
    process.env['HTTP_LOG_BATCH_SIZE'] = '1';
    process.env['HTTP_LOG_AUTH_TOKEN'] = 'tok';

    const sendSpy = vi.fn(async () => undefined);
    const withAuthSpy = vi.fn(() => undefined);

    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: {
        post: (_url: string, _body: unknown) => ({ withAuth: withAuthSpy, send: sendSpy }),
      },
    }));

    const orig = globalThis.setTimeout;
    delete (globalThis as any).setTimeout;

    try {
      const { HttpLogger } = await import('@/config/logging/HttpLogger');

      await expect(
        HttpLogger.enqueue({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'micro',
        })
      ).resolves.toBeUndefined();

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(withAuthSpy).toHaveBeenCalled();
    } finally {
      (globalThis as any).setTimeout = orig;
    }
  });

  it('does not use withAuth when HTTP_LOG_AUTH_TOKEN is not set', async () => {
    process.env['HTTP_LOG_ENABLED'] = 'true';
    process.env['HTTP_LOG_ENDPOINT_URL'] = 'https://example.com/logs';
    process.env['HTTP_LOG_BATCH_SIZE'] = '1';
    delete process.env['HTTP_LOG_AUTH_TOKEN'];

    const sendSpy = vi.fn(async () => undefined);
    const withAuthSpy = vi.fn(() => undefined);

    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: {
        post: (_url: string, _body: unknown) => ({ withAuth: withAuthSpy, send: sendSpy }),
      },
    }));

    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: any, _ms?: number) => {
      setImmediate(cb as any);
      return 1 as any;
    }) as unknown as TimeoutFn;

    try {
      const { HttpLogger } = await import('@/config/logging/HttpLogger');

      await HttpLogger.enqueue({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 't2',
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(withAuthSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = original;
    }
  });
});
