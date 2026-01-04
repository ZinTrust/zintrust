import { beforeEach, describe, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('DenoAdapter - extra branches', () => {
  test('parseRequest should use x-forwarded-for header', async () => {
    const CF = (await import('@/runtime/adapters/DenoAdapter')).DenoAdapter;
    const adapter = CF.create({ handler: async () => undefined });

    const req = {
      method: 'GET',
      url: 'https://example.test/path?x=1',
      headers: new Headers({ 'x-forwarded-for': '1.2.3.4' }),
    } as unknown as Request;

    const parsed = adapter.parseRequest(req);
    expect(parsed.remoteAddr).toBe('1.2.3.4');
    expect(parsed.query).toEqual({ x: '1' });
  });

  test('formatResponse should handle non-string bodies and array headers', async () => {
    const CF = (await import('@/runtime/adapters/DenoAdapter')).DenoAdapter;
    const adapter = CF.create({ handler: async () => undefined });

    const response = adapter.formatResponse({
      statusCode: 200,
      headers: { 'set-cookie': ['a=1', 'b=2'] },
      body: Buffer.from('ok'),
    });
    // @ts-ignore
    expect(await (response as Response).text()).toBe('ok');
    // headers
    // @ts-ignore
    expect((response as Response).headers.get('set-cookie')).toBe('a=1, b=2');
  });

  test('handle should send 504 when handler exceeds timeout', async () => {
    vi.useFakeTimers();

    const CF = (await import('@/runtime/adapters/DenoAdapter')).DenoAdapter;

    const adapter = CF.create({
      timeout: 10,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 50));
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
      arrayBuffer: async () => new TextEncoder().encode('x').buffer,
    } as unknown as Request;

    const p = adapter.handle(event);
    await vi.advanceTimersByTimeAsync(60);
    const res = await p;

    expect(res.statusCode).toBe(504);
    expect(String(res.body)).toContain('Gateway Timeout');

    vi.useRealTimers();
  });

  test('getKV/getEnvVar/isDeployEnvironment use Deno globals', async () => {
    // inject fake Deno globals
    // @ts-ignore
    globalThis.Deno = {
      openKv: async () => ({ kind: 'kv' }),
      env: {
        get: (k: string) => (k === 'X' ? 'Y' : undefined),
        toObject: () => ({ DENO_ENV: 'development', DB_CONNECTION: 'pg' }),
      },
      mainModule: 'https://deno.land/x/denoDeploy/mod.ts',
    };

    const CF = (await import('@/runtime/adapters/DenoAdapter')).DenoAdapter;

    await expect(CF.getKV()).resolves.toEqual({ kind: 'kv' });
    expect(CF.getEnvVar('X', 'DEF')).toBe('Y');
    expect(CF.getEnvVar('MISSING', 'DEF')).toBe('DEF');
    expect(CF.isDeployEnvironment()).toBe(true);

    // cleanup
    // @ts-ignore
    delete globalThis.Deno;
  });

  test('default getLogger proxies to global Logger with Deno prefix', async () => {
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.doMock('@config/logger', () => ({ default: mockLogger }));

    const CF = (await import('@/runtime/adapters/DenoAdapter')).DenoAdapter;
    const adapter = CF.create({ handler: async () => undefined });
    const g = adapter.getLogger();

    g.debug('x', { a: 1 });
    expect(mockLogger.debug).toHaveBeenCalledWith('[Deno] x', JSON.stringify({ a: 1 }));

    g.info('y');
    expect(mockLogger.info).toHaveBeenCalledWith('[Deno] y', '');

    g.warn('z');
    expect(mockLogger.warn).toHaveBeenCalledWith('[Deno] z', '');

    g.error('oopsy', new Error('fail'));
    expect(mockLogger.error).toHaveBeenCalledWith('[Deno] oopsy', 'fail');
  });
});
