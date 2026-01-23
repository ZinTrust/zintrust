import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/app', () => ({
  appConfig: {
    prefix: 'zintrust-zintrust-test',
  },
}));

const warnMock = vi.fn();
vi.mock('@zintrust/core', () => ({
  Logger: {
    warn: warnMock,
  },
}));

describe('RedisKeyManager (coverage)', () => {
  it('builds prefixed keys and helpers', async () => {
    const {
      createRedisKey,
      createQueueKey,
      createBullMQKey,
      createWorkerKey,
      createSessionKey,
      createCacheKey,
      extractOriginalKey,
      isAppKey,
      getPrefix,
    } = await import('@tools/redis/RedisKeyManager');

    expect(getPrefix()).toBe('zintrust-zintrust-test');

    expect(createRedisKey('cache:myKey')).toBe('zintrust-zintrust-test:cache:myKey');
    expect(createQueueKey('jobs')).toBe('zintrust-zintrust-test:queue:jobs');
    expect(createBullMQKey('emails')).toBe('zintrust-zintrust-test:bull:emails');
    expect(createWorkerKey('email-worker')).toBe('zintrust-zintrust-test:worker:email-worker');
    expect(createSessionKey('session-1')).toBe('zintrust-zintrust-test:session:session-1');
    expect(createCacheKey('hot')).toBe('zintrust-zintrust-test:cache:hot');

    expect(extractOriginalKey('zintrust-zintrust-test:cache:hot')).toBe('cache:hot');
    expect(extractOriginalKey('other-prefix:cache:hot')).toBe('other-prefix:cache:hot');

    expect(isAppKey('zintrust-zintrust-test:cache:hot')).toBe(true);
    expect(isAppKey('other-prefix:cache:hot')).toBe(false);
  });

  it('creates keys by type', async () => {
    const { createKeyByType } = await import('@tools/redis/RedisKeyManager');

    expect(createKeyByType('queue', 'jobs')).toBe('zintrust-zintrust-test:queue:jobs');
    expect(createKeyByType('bullmq', 'emails')).toBe('zintrust-zintrust-test:bull:emails');
    expect(createKeyByType('worker', 'email-worker')).toBe(
      'zintrust-zintrust-test:worker:email-worker'
    );
    expect(createKeyByType('session', 'session-1')).toBe(
      'zintrust-zintrust-test:session:session-1'
    );
    expect(createKeyByType('cache', 'hot')).toBe('zintrust-zintrust-test:cache:hot');
    expect(createKeyByType('custom', 'misc')).toBe('zintrust-zintrust-test:misc');
    expect(createKeyByType('unknown' as never, 'misc')).toBe('zintrust-zintrust-test:misc');
  });

  it('sanitizes colon-wrapped keys and warns on empty key', async () => {
    const { createRedisKey } = await import('@tools/redis/RedisKeyManager');

    expect(createRedisKey('::cache:myKey::')).toBe('zintrust-zintrust-test:cache:myKey');
    expect(createRedisKey('')).toBe('zintrust-zintrust-test');
    expect(warnMock).toHaveBeenCalledWith('RedisKeyManager: Empty key provided');
  });
});
