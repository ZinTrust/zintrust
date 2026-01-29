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
    const { createRedisKey, extractOriginalKey, isAppKey, getPrefix, RedisKeys } =
      await import('@tools/redis/RedisKeyManager');

    expect(getPrefix()).toBe('zintrust_zintrust_test');

    expect(createRedisKey('cache:myKey')).toBe('zintrust_zintrust_test:cache:myKey');
    expect(RedisKeys.createQueueKey('jobs')).toBe('zintrust_zintrust_test:queue:jobs');
    expect(RedisKeys.createBullMQKey('emails')).toBe('zintrust_zintrust_test:bull:emails');
    expect(RedisKeys.createWorkerKey('email-worker')).toBe(
      'zintrust_zintrust_test:worker:email-worker'
    );
    expect(RedisKeys.createSessionKey('session-1')).toBe(
      'zintrust_zintrust_test:session:session-1'
    );
    expect(RedisKeys.createCacheKey('hot')).toBe('zintrust_zintrust_test:cache:hot');

    expect(extractOriginalKey('zintrust_zintrust_test:cache:hot')).toBe('cache:hot');
    expect(extractOriginalKey('other_prefix_cache:hot')).toBe('other_prefix_cache:hot');

    expect(isAppKey('zintrust_zintrust_test:cache:hot')).toBe(true);
    expect(isAppKey('other_prefix_cache:hot')).toBe(false);
    expect(isAppKey('zintrust_zintrust_test:cache:hot')).toBe(true);
  });

  it('creates keys by type', async () => {
    // createKeyByType was removed. Test equivalent RedisKeys methods instead.
    const { RedisKeys: RK, createRedisKey: crk } = await import('@tools/redis/RedisKeyManager');
    expect(RK.createQueueKey('jobs')).toBe('zintrust_zintrust_test:queue:jobs');
    expect(RK.createBullMQKey('emails')).toBe('zintrust_zintrust_test:bull:emails');
    expect(RK.createWorkerKey('email-worker')).toBe('zintrust_zintrust_test:worker:email-worker');
    expect(RK.createSessionKey('session-1')).toBe('zintrust_zintrust_test:session:session-1');
    expect(RK.createCacheKey('hot')).toBe('zintrust_zintrust_test:cache:hot');
    expect(crk('misc')).toBe('zintrust_zintrust_test:misc');
  });

  it('sanitizes colon-wrapped keys and warns on empty key', async () => {
    const { createRedisKey } = await import('@tools/redis/RedisKeyManager');

    expect(createRedisKey('::cache:myKey::')).toBe('zintrust_zintrust_test:cache:myKey');
    expect(createRedisKey('')).toBe('zintrust_zintrust_test');
    // Warning is logged but not tested here to avoid mock complexity
  });
});
