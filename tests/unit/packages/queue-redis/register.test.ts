import { afterEach, describe, expect, it, vi } from 'vitest';

describe('queue-redis register', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock('@zintrust/core');
    vi.doUnmock('../../../../packages/queue-redis/src/BullMQRedisQueue');
  });

  it('does not throw when the core Queue export is present without a register function', async () => {
    vi.doMock('@zintrust/core', () => ({ Queue: {} }));
    vi.doMock('../../../../packages/queue-redis/src/BullMQRedisQueue', () => ({
      default: { enqueue: vi.fn() },
    }));

    await expect(import('../../../../packages/queue-redis/src/register')).resolves.toBeDefined();
  });

  it('registers the redis driver when the core Queue registry is available', async () => {
    const register = vi.fn();

    vi.doMock('@zintrust/core', () => ({
      Queue: { register },
    }));

    vi.doMock('../../../../packages/queue-redis/src/BullMQRedisQueue', () => ({
      default: { enqueue: vi.fn() },
    }));

    await import('../../../../packages/queue-redis/src/register');

    expect(register).toHaveBeenCalledWith('redis', expect.any(Object));
  });
});
