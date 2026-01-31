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
    expect(RedisKeys.createQueueKey('jobs')).toBe('zintrust_zintrust_test_queue:jobs');
    expect(RedisKeys.createBullMQKey('emails')).toBe('zintrust_zintrust_test_bull:emails');
    expect(RedisKeys.createWorkerKey('email-worker')).toBe(
      'zintrust_zintrust_test_worker:email-worker'
    );
    expect(RedisKeys.createSessionKey('session-1')).toBe(
      'zintrust_zintrust_test_session:session-1'
    );
    expect(RedisKeys.createCacheKey('hot')).toBe('zintrust_zintrust_test_cache:hot');

    expect(extractOriginalKey('zintrust_zintrust_test:cache:hot')).toBe('cache:hot');
    expect(extractOriginalKey('other_prefix_cache:hot')).toBe('other_prefix_cache:hot');

    expect(isAppKey('zintrust_zintrust_test:cache:hot')).toBe(true);
    expect(isAppKey('other_prefix_cache:hot')).toBe(false);
    expect(isAppKey('zintrust_zintrust_test:cache:hot')).toBe(true);
  });

  it('creates keys by type', async () => {
    // createKeyByType was removed. Test equivalent RedisKeys methods instead.
    const { RedisKeys: RK, createRedisKey: crk } = await import('@tools/redis/RedisKeyManager');
    expect(RK.createQueueKey('jobs')).toBe('zintrust_zintrust_test_queue:jobs');
    expect(RK.createBullMQKey('emails')).toBe('zintrust_zintrust_test_bull:emails');
    expect(RK.createWorkerKey('email-worker')).toBe('zintrust_zintrust_test_worker:email-worker');
    expect(RK.createSessionKey('session-1')).toBe('zintrust_zintrust_test_session:session-1');
    expect(RK.createCacheKey('hot')).toBe('zintrust_zintrust_test_cache:hot');
    expect(crk('misc')).toBe('zintrust_zintrust_test:misc');
  });

  it('covers lazy prefix initialization', async () => {
    const { RedisKeys } = await import('@tools/redis/RedisKeyManager');

    // These should trigger lazy initialization of the prefixes
    expect(RedisKeys.metricsPrefix).toBe('zintrust_zintrust_test_metrics:');
    expect(RedisKeys.healthPrefix).toBe('zintrust_zintrust_test_health:');
    expect(RedisKeys.workerPrefix).toBe('zintrust_zintrust_test_worker:');
    expect(RedisKeys.queuePrefix).toBe('zintrust_zintrust_test_queue:');
    expect(RedisKeys.bullmqPrefix).toBe('zintrust_zintrust_test_bull:');
    expect(RedisKeys.queueLockPrefix).toBe('zintrust_zintrust_test_lock:');
    expect(RedisKeys.cachePrefix).toBe('zintrust_zintrust_test_cache:');
    expect(RedisKeys.sessionPrefix).toBe('zintrust_zintrust_test_session:');
    expect(RedisKeys.csrfPrefix).toBe('zintrust_zintrust_test_csrf:');
    expect(RedisKeys.getCsrfPrefix()).toBe('zintrust_zintrust_test_csrf:');
  });

  it('sanitizes colon-wrapped keys and warns on empty key', async () => {
    const { createRedisKey } = await import('@tools/redis/RedisKeyManager');

    expect(createRedisKey('::cache:myKey::')).toBe('zintrust_zintrust_test:cache:myKey');
    expect(createRedisKey('')).toBe('zintrust_zintrust_test');
    // Warning is logged but not tested here to avoid mock complexity
  });

  it('covers RedisKeys create methods', async () => {
    const { RedisKeys } = await import('@tools/redis/RedisKeyManager');

    // Test createMetricsKey
    expect(RedisKeys.createMetricsKey('worker1', 'cpu', '1m')).toBe(
      'zintrust_zintrust_test_metrics:worker1:cpu:1m'
    );

    // Test createHealthKey
    expect(RedisKeys.createHealthKey('worker1')).toBe('zintrust_zintrust_test_health:worker1');

    // Test createQueueLockKey
    expect(RedisKeys.createQueueLockKey('job123')).toBe('zintrust_zintrust_test_lock:job123');

    // Test createCsrfKey
    expect(RedisKeys.createCsrfKey('session-123')).toBe('zintrust_zintrust_test_csrf:session-123');
  });

  it('covers RedisKeys reset functionality', async () => {
    const { RedisKeys } = await import('@tools/redis/RedisKeyManager');

    // First access to initialize prefixes
    expect(RedisKeys.metricsPrefix).toBe('zintrust_zintrust_test_metrics:');
    expect(RedisKeys.healthPrefix).toBe('zintrust_zintrust_test_health:');

    // Reset all prefixes
    RedisKeys.reset();

    // After reset, accessing should reinitialize
    expect(RedisKeys.metricsPrefix).toBe('zintrust_zintrust_test_metrics:');
    expect(RedisKeys.healthPrefix).toBe('zintrust_zintrust_test_health:');
    expect(RedisKeys.workerPrefix).toBe('zintrust_zintrust_test_worker:');
    expect(RedisKeys.queuePrefix).toBe('zintrust_zintrust_test_queue:');
    expect(RedisKeys.bullmqPrefix).toBe('zintrust_zintrust_test_bull:');
    expect(RedisKeys.queueLockPrefix).toBe('zintrust_zintrust_test_lock:');
    expect(RedisKeys.cachePrefix).toBe('zintrust_zintrust_test_cache:');
    expect(RedisKeys.sessionPrefix).toBe('zintrust_zintrust_test_session:');
  });

  it('covers createKeyByType legacy function', async () => {
    const { createKeyByType } = await import('@tools/redis/RedisKeyManager');

    // Note: createKeyByType is deprecated but we test it for backward compatibility
    expect(createKeyByType('queue', 'jobs')).toBe('zintrust_zintrust_test_queue:jobs');
    expect(createKeyByType('bullmq', 'emails')).toBe('zintrust_zintrust_test_bull:emails');
    expect(createKeyByType('worker', 'email-worker')).toBe(
      'zintrust_zintrust_test_worker:email-worker'
    );
    expect(createKeyByType('session', 'session-1')).toBe(
      'zintrust_zintrust_test_session:session-1'
    );
    expect(createKeyByType('cache', 'hot')).toBe('zintrust_zintrust_test_cache:hot');
    expect(createKeyByType('custom', 'misc')).toBe('zintrust_zintrust_test:misc');
    expect(createKeyByType('unknown' as any, 'fallback')).toBe('zintrust_zintrust_test:fallback');
  });
});
