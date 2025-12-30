import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('KvLogger', () => {
  const originalEnv = (globalThis as unknown as { env?: unknown }).env;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    process.env['KV_LOG_ENABLED'] = 'true';
    process.env['KV_NAMESPACE'] = 'CACHE';
    delete process.env['KV_LOG_RETENTION_DAYS'];
  });

  afterEach(() => {
    vi.useRealTimers();

    if (originalEnv === undefined) {
      delete (globalThis as unknown as { env?: unknown }).env;
    } else {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }

    delete process.env['KV_LOG_ENABLED'];
    delete process.env['KV_NAMESPACE'];
    delete process.env['KV_LOG_RETENTION_DAYS'];
  });

  it('writes a batch to KV with retention TTL', async () => {
    const put = vi.fn(async () => undefined);
    (globalThis as unknown as { env?: Record<string, unknown> }).env = {
      CACHE: {
        get: vi.fn(),
        put,
        delete: vi.fn(),
      },
    };

    const { KvLogger } = await import('@/config/logging/KvLogger');

    const p = KvLogger.enqueue({
      timestamp: new Date('2025-12-28T12:34:56.000Z').toISOString(),
      level: 'error',
      message: 'Oops',
      category: 'test',
      data: { ok: true },
      error: 'boom',
    });

    await vi.advanceTimersByTimeAsync(1000);
    await p;

    expect(put).toHaveBeenCalledTimes(1);

    const [key, payload, opts] = put.mock.calls[0] as unknown as [string, string, any];
    expect(key).toMatch(/^logs:2025-12-28:12:/);

    const parsed = JSON.parse(payload) as any;
    expect(parsed.count).toBe(1);
    expect(parsed.events[0].message).toBe('Oops');

    expect(opts).toBeDefined();
    expect(opts.expirationTtl).toBe(30 * 24 * 60 * 60);
  });

  it('does nothing when disabled', async () => {
    process.env['KV_LOG_ENABLED'] = 'false';

    const put = vi.fn(async () => undefined);
    (globalThis as unknown as { env?: Record<string, unknown> }).env = {
      CACHE: {
        get: vi.fn(),
        put,
        delete: vi.fn(),
      },
    };

    const { KvLogger } = await import('@/config/logging/KvLogger');

    const p = KvLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Nope',
    });

    await vi.runAllTimersAsync();
    await p;

    expect(put).not.toHaveBeenCalled();
  });
});
