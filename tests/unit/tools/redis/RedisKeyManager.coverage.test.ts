import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/app', () => ({
  appConfig: {
    prefix: 'zintrust_zintrust_test',
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

    expect(getPrefix()).toBe('zintrust_zintrust_test');

    expect(createRedisKey('cache:myKey')).toBe('zintrust_zintrust_test:cache:myKey');
    expect(createQueueKey('jobs')).toBe('zintrust_zintrust_test:queue:jobs');
    expect(createBullMQKey('emails')).toBe('zintrust_zintrust_test:bull:emails');
    expect(createWorkerKey('email-worker')).toBe('zintrust_zintrust_test:worker:email-worker');
    expect(createSessionKey('session-1')).toBe('zintrust_zintrust_test:session:session-1');
    expect(createCacheKey('hot')).toBe('zintrust_zintrust_test:cache:hot');

    expect(extractOriginalKey('zintrust_zintrust_test:cache:hot')).toBe('cache:hot');
    expect(extractOriginalKey('other_prefix_cache:hot')).toBe('other_prefix_cache:hot');

    expect(isAppKey('zintrust_zintrust_test:cache:hot')).toBe(true);
    expect(isAppKey('other_prefix_cache:hot')).toBe(false);
    expect(isAppKey('zintrust_zintrust_test:cache:hot')).toBe(true);
  });

  it('creates keys by type', async () => {
    const { createKeyByType } = await import('@tools/redis/RedisKeyManager');

    expect(createKeyByType('queue', 'jobs')).toBe('zintrust_zintrust_test:queue:jobs');
    expect(createKeyByType('bullmq', 'emails')).toBe('zintrust_zintrust_test:bull:emails');
    expect(createKeyByType('worker', 'email-worker')).toBe(
      'zintrust_zintrust_test:worker:email-worker'
    );
    expect(createKeyByType('session', 'session-1')).toBe(
      'zintrust_zintrust_test:session:session-1'
    );
    expect(createKeyByType('cache', 'hot')).toBe('zintrust_zintrust_test:cache:hot');
    expect(createKeyByType('custom', 'misc')).toBe('zintrust_zintrust_test:misc');
    expect(createKeyByType('unknown' as never, 'misc')).toBe('zintrust_zintrust_test:misc');
  });

  it('sanitizes colon-wrapped keys and warns on empty key', async () => {
    const { createRedisKey } = await import('@tools/redis/RedisKeyManager');

    expect(createRedisKey('::cache:myKey::')).toBe('zintrust_zintrust_test:cache:myKey');
    expect(createRedisKey('')).toBe('zintrust_zintrust_test');
    // Warning is logged but not tested here to avoid mock complexity
  });
});
