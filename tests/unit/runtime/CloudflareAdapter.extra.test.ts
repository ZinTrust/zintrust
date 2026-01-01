import { beforeEach, describe, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('CloudflareAdapter - extra branches', () => {
  test('handle should send 504 when handler exceeds timeout', async () => {
    vi.useFakeTimers();

    const CF = (await import('@/runtime/adapters/CloudflareAdapter')).CloudflareAdapter;

    const adapter = CF.create({
      timeout: 10,
      handler: async () => {
        // slow handler
        await new Promise((res) => setTimeout(res, 50));
      },
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const event = {
      method: 'POST',
      url: 'https://example.test/slow',
      headers: new Headers(),
      text: async () => 'x',
      body: null,
    } as unknown as import('@/runtime/adapters/CloudflareAdapter').CloudflareRequest;

    const p = adapter.handle(event);

    // advance timers to trigger both adapter timeout and handler finish
    await vi.advanceTimersByTimeAsync(60);
    const res = await p;

    expect(res.statusCode).toBe(504);
    expect(String(res.body)).toContain('Gateway Timeout');

    vi.useRealTimers();
  });

  test('formatResponse handles non-string body by calling toString', async () => {
    const CF = (await import('@/runtime/adapters/CloudflareAdapter')).CloudflareAdapter;
    const adapter = CF.create({ handler: async () => undefined });

    const response = adapter.formatResponse({ statusCode: 200, headers: {}, body: 123 });
    // @ts-ignore
    expect(await (response as Response).text()).toBe('123');
  });

  test('default getLogger proxies to global Logger with Cloudflare prefix', async () => {
    // mock named export Logger
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.doMock('@config/logger', () => ({ Logger: mockLogger }));

    const CF = (await import('@/runtime/adapters/CloudflareAdapter')).CloudflareAdapter;
    const adapter = CF.create({ handler: async () => undefined });
    const g = adapter.getLogger();

    g.debug('x', { a: 1 });
    expect(mockLogger.debug).toHaveBeenCalledWith('[Cloudflare] x', JSON.stringify({ a: 1 }));

    g.info('y');
    expect(mockLogger.info).toHaveBeenCalledWith('[Cloudflare] y', '');

    g.warn('z');
    expect(mockLogger.warn).toHaveBeenCalledWith('[Cloudflare] z', '');

    g.error('oopsy', new Error('fail'));
    expect(mockLogger.error).toHaveBeenCalledWith('[Cloudflare] oopsy', 'fail');
  });
});
